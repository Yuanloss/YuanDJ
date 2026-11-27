// heart-rate.cs - BLE 广告监听器（小米手环运动心率广播）
// 编译: build.cmd (用 csc.exe / C# 5 语法)
// 用法: heart-rate.exe scan | heart-rate.exe monitor <mac>
//
// 关键实现（参考 bleak WinRT 扫描器）：
// 1. ScanningMode = Active（必须，否则收不到 Scan Response）
// 2. AllowExtendedAdvertisements = true（BLE 5.0 扩展广播）
// 3. 不设 ServiceUuid filter（否则会丢 SCAN_RSP 包）
// 4. 按 MAC 自己合并 ADV + SCAN_RSP（Windows 不自动合并）
// 5. 不依赖 LocalName 匹配（LocalName 经常只在 SCAN_RSP 里）

using System;
using System.Collections.Generic;
using System.Globalization;
using System.Reflection;
using System.Runtime.InteropServices.WindowsRuntime;
using System.Threading;
using Windows.Devices.Bluetooth.Advertisement;
using Windows.Foundation;
using Windows.Storage.Streams;

namespace HeartRateMonitor
{
    internal class Program
    {
        private const ushort MiCompanyId = 0x0157;
        private const int DisconnectTimeoutSec = 30;
        private const int ScanDurationMs = 5000;

        private static int Main(string[] args)
        {
            try
            {
                if (args.Length == 0 || args[0] == "scan")
                    return RunScan();
                if (args[0] == "monitor" && args.Length >= 2)
                    return RunMonitor(args[1]);

                WriteJsonError("usage: heart-rate.exe [scan | monitor <mac>]");
                return 1;
            }
            catch (Exception ex)
            {
                WriteJsonError("fatal: " + ex.Message);
                return 1;
            }
        }

        // ===== 扫描阶段 =====
        private class ScanState
        {
            public readonly object Lock = new object();
            public readonly Dictionary<ulong, MergedDevice> Devices = new Dictionary<ulong, MergedDevice>();
            public int TotalAdvCount;
            public int MiAdvCount;
        }

        private class MergedDevice
        {
            public ulong BluetoothAddress;
            public string Address;
            public string AdvName = "";
            public string ScanRespName = "";
            public byte[] MiData;
            public DateTime LastSeen;

            public string BestName
            {
                get
                {
                    if (!string.IsNullOrEmpty(ScanRespName)) return ScanRespName;
                    if (!string.IsNullOrEmpty(AdvName)) return AdvName;
                    return "";
                }
            }
        }

        private static ScanState _scanState;

        private static int RunScan()
        {
            var state = new ScanState();
            _scanState = state;

            var watcher = new BluetoothLEAdvertisementWatcher();
            watcher.ScanningMode = BluetoothLEScanningMode.Active;
            // 关键：允许 BLE 5.0 扩展广播（新版 Mi Band 默认用扩展广播）
            watcher.AllowExtendedAdvertisements = true;

            var handler = new TypedEventHandler<BluetoothLEAdvertisementWatcher, BluetoothLEAdvertisementReceivedEventArgs>(OnScanReceived);
            EventRegistrationToken token = SubscribeReceived(watcher, handler);

            watcher.Start();
            // 检查 watcher 是否成功启动
            Thread.Sleep(300);
            if (watcher.Status != BluetoothLEAdvertisementWatcherStatus.Started)
            {
                WriteJsonError("watcher failed to start, status: " + watcher.Status);
                try { watcher.Stop(); } catch { }
                try { UnsubscribeReceived(watcher, token); } catch { }
                return 1;
            }

            Thread.Sleep(ScanDurationMs);
            watcher.Stop();
            Thread.Sleep(300);
            try { UnsubscribeReceived(watcher, token); } catch { }

            // 输出统计信息（诊断用）
            Console.WriteLine("{\"type\":\"scan_stats\",\"total_adv\":" + state.TotalAdvCount +
                              ",\"mi_adv\":" + state.MiAdvCount +
                              ",\"mi_device_count\":" + CountMiDevices(state) + "}");

            // 输出有小米 ManufacturerData 的设备
            int count = 0;
            lock (state.Lock)
            {
                foreach (var kvp in state.Devices)
                {
                    var d = kvp.Value;
                    if (d.MiData == null) continue;

                    int hr = d.MiData.Length > 3 ? d.MiData[3] : 0;
                    string dataHex = BitConverter.ToString(d.MiData).Replace("-", "");

                    Console.WriteLine("{\"type\":\"device\",\"id\":\"" + d.Address +
                                      "\",\"name\":\"" + EscapeJson(d.BestName) +
                                      "\",\"address\":\"" + d.Address +
                                      "\",\"model\":\"Xiaomi\",\"data\":\"" + dataHex +
                                      "\",\"hr\":" + hr +
                                      ",\"adv_name\":\"" + EscapeJson(d.AdvName) +
                                      "\",\"scan_resp_name\":\"" + EscapeJson(d.ScanRespName) +
                                      "\"}");
                    count++;
                }
            }
            Console.WriteLine("{\"type\":\"scan_complete\",\"count\":" + count + "}");
            return 0;
        }

        private static int CountMiDevices(ScanState state)
        {
            int n = 0;
            lock (state.Lock)
            {
                foreach (var kvp in state.Devices)
                {
                    if (kvp.Value.MiData != null) n++;
                }
            }
            return n;
        }

        private static void OnScanReceived(BluetoothLEAdvertisementWatcher sender, BluetoothLEAdvertisementReceivedEventArgs args)
        {
            var state = _scanState;

            // 检查是否包含小米 ManufacturerData
            byte[] miData = null;
            foreach (var md in args.Advertisement.ManufacturerData)
            {
                if (md.CompanyId == MiCompanyId)
                {
                    var reader = DataReader.FromBuffer(md.Data);
                    miData = new byte[reader.UnconsumedBufferLength];
                    reader.ReadBytes(miData);
                    break;
                }
            }

            lock (state.Lock)
            {
                state.TotalAdvCount++;

                MergedDevice dev;
                if (!state.Devices.TryGetValue(args.BluetoothAddress, out dev))
                {
                    dev = new MergedDevice
                    {
                        BluetoothAddress = args.BluetoothAddress,
                        Address = FormatAddress(args.BluetoothAddress)
                    };
                    state.Devices[args.BluetoothAddress] = dev;
                }

                dev.LastSeen = DateTime.UtcNow;

                // 合并 ADV 和 SCAN_RSP：LocalName 可能在任意一个包
                string name = args.Advertisement.LocalName ?? "";
                bool isScanResp = args.AdvertisementType == BluetoothLEAdvertisementType.ScanResponse;
                if (isScanResp)
                {
                    if (!string.IsNullOrEmpty(name)) dev.ScanRespName = name;
                }
                else
                {
                    if (!string.IsNullOrEmpty(name)) dev.AdvName = name;
                }

                // ManufacturerData 也可能在任意一个包里
                if (miData != null)
                {
                    state.MiAdvCount++;
                    dev.MiData = miData;
                }
            }
        }

        // ===== 监测阶段 =====
        private class MonitorState
        {
            public readonly object Lock = new object();
            public bool Connected;
            public int LastHR;
            public DateTime LastSeen = DateTime.UtcNow;
            public string DeviceName = "";
        }

        private static MonitorState _monitorState;
        private static ulong _monitorTargetAddr;
        private static string _monitorMac;

        private static int RunMonitor(string mac)
        {
            ulong targetAddr = ParseAddress(mac);
            if (targetAddr == 0)
            {
                WriteJsonError("invalid mac: " + mac);
                return 1;
            }

            Console.WriteLine("{\"type\":\"connecting\",\"deviceId\":\"" + EscapeJson(mac) + "\"}");

            var state = new MonitorState();
            _monitorState = state;
            _monitorTargetAddr = targetAddr;
            _monitorMac = mac;

            var watcher = new BluetoothLEAdvertisementWatcher();
            watcher.ScanningMode = BluetoothLEScanningMode.Active;
            watcher.AllowExtendedAdvertisements = true;

            var handler = new TypedEventHandler<BluetoothLEAdvertisementWatcher, BluetoothLEAdvertisementReceivedEventArgs>(OnMonitorReceived);
            EventRegistrationToken token = SubscribeReceived(watcher, handler);

            watcher.Start();
            Thread.Sleep(300);
            if (watcher.Status != BluetoothLEAdvertisementWatcherStatus.Started)
            {
                WriteJsonError("watcher failed to start, status: " + watcher.Status);
                try { watcher.Stop(); } catch { }
                try { UnsubscribeReceived(watcher, token); } catch { }
                return 1;
            }

            Console.WriteLine("{\"type\":\"status\",\"message\":\"monitoring " + EscapeJson(mac) + "\"}");

            var stopEvent = new ManualResetEventSlim(false);
            Console.CancelKeyPress += (s, e) => { e.Cancel = true; stopEvent.Set(); };

            while (!stopEvent.IsSet)
            {
                Thread.Sleep(2000);
                bool shouldDisconnect = false;
                lock (state.Lock)
                {
                    if (state.Connected && (DateTime.UtcNow - state.LastSeen).TotalSeconds > DisconnectTimeoutSec)
                    {
                        state.Connected = false;
                        state.LastHR = 0;
                        shouldDisconnect = true;
                    }
                }
                if (shouldDisconnect)
                {
                    Console.WriteLine("{\"type\":\"disconnected\"}");
                }
            }

            try { watcher.Stop(); } catch { }
            try { UnsubscribeReceived(watcher, token); } catch { }
            return 0;
        }

        private static void OnMonitorReceived(BluetoothLEAdvertisementWatcher sender, BluetoothLEAdvertisementReceivedEventArgs args)
        {
            var state = _monitorState;
            ulong targetAddr = _monitorTargetAddr;
            string mac = _monitorMac;

            if (args.BluetoothAddress != targetAddr) return;

            DateTime now = DateTime.UtcNow;
            bool sendConnected;

            lock (state.Lock)
            {
                state.LastSeen = now;
                sendConnected = !state.Connected;
                if (sendConnected) state.Connected = true;

                // 合并 name（来自 ADV 或 SCAN_RSP）
                string name = args.Advertisement.LocalName ?? "";
                if (!string.IsNullOrEmpty(name)) state.DeviceName = name;
            }

            if (sendConnected)
            {
                string name = state.DeviceName;
                if (string.IsNullOrEmpty(name)) name = "Xiaomi Smart Band";
                Console.WriteLine("{\"type\":\"connected\",\"deviceId\":\"" + EscapeJson(mac) +
                                  "\",\"name\":\"" + EscapeJson(name) + "\"}");
            }

            // 从 ManufacturerData 提取心率（每次广播包都可能有）
            int hr;
            if (TryExtractHeartRate(args.Advertisement, out hr) && hr > 0 && hr != 0xFF)
            {
                lock (state.Lock)
                {
                    if (hr != state.LastHR)
                    {
                        state.LastHR = hr;
                        long ts = new DateTimeOffset(DateTime.UtcNow).ToUnixTimeSeconds();
                        Console.WriteLine("{\"type\":\"heart_rate\",\"hr\":" + hr +
                                          ",\"timestamp\":" + ts + "}");
                    }
                }
            }
        }

        // ===== WinRT 事件订阅辅助（C# 5 编译器不支持 += / add_Received，用反射） =====

        private static EventRegistrationToken SubscribeReceived(
            BluetoothLEAdvertisementWatcher watcher,
            TypedEventHandler<BluetoothLEAdvertisementWatcher, BluetoothLEAdvertisementReceivedEventArgs> handler)
        {
            Type t = typeof(BluetoothLEAdvertisementWatcher);
            MethodInfo add = t.GetMethod("add_Received",
                BindingFlags.Instance | BindingFlags.Public | BindingFlags.InvokeMethod);
            if (add == null)
            {
                return (EventRegistrationToken)t.InvokeMember(
                    "add_Received",
                    BindingFlags.Instance | BindingFlags.Public | BindingFlags.InvokeMethod,
                    null, watcher, new object[] { handler });
            }
            return (EventRegistrationToken)add.Invoke(watcher, new object[] { handler });
        }

        private static void UnsubscribeReceived(BluetoothLEAdvertisementWatcher watcher, EventRegistrationToken token)
        {
            Type t = typeof(BluetoothLEAdvertisementWatcher);
            MethodInfo remove = t.GetMethod("remove_Received",
                BindingFlags.Instance | BindingFlags.Public | BindingFlags.InvokeMethod);
            if (remove == null)
            {
                t.InvokeMember(
                    "remove_Received",
                    BindingFlags.Instance | BindingFlags.Public | BindingFlags.InvokeMethod,
                    null, watcher, new object[] { token });
                return;
            }
            remove.Invoke(watcher, new object[] { token });
        }

        // ===== 工具方法 =====

        // 从 ManufacturerData 中提取心率（小米手环广播格式：data[3] = 心率）
        private static bool TryExtractHeartRate(BluetoothLEAdvertisement adv, out int hr)
        {
            hr = 0;
            foreach (var md in adv.ManufacturerData)
            {
                if (md.CompanyId != MiCompanyId) continue;

                var reader = DataReader.FromBuffer(md.Data);
                byte[] data = new byte[reader.UnconsumedBufferLength];
                reader.ReadBytes(data);

                // 小米手环广播格式: [head, op, status, hr, ...]
                if (data.Length > 3)
                {
                    hr = data[3];
                    return true;
                }
                return false;
            }
            return false;
        }

        private static string FormatAddress(ulong addr)
        {
            return string.Format(CultureInfo.InvariantCulture,
                "{0:X2}:{1:X2}:{2:X2}:{3:X2}:{4:X2}:{5:X2}",
                (addr >> 40) & 0xFF, (addr >> 32) & 0xFF,
                (addr >> 24) & 0xFF, (addr >> 16) & 0xFF,
                (addr >> 8) & 0xFF, addr & 0xFF);
        }

        private static ulong ParseAddress(string mac)
        {
            if (string.IsNullOrEmpty(mac)) return 0;
            string[] parts = mac.Split(':');
            if (parts.Length != 6) return 0;
            ulong addr = 0;
            for (int i = 0; i < 6; i++)
            {
                byte b;
                if (!byte.TryParse(parts[i], NumberStyles.HexNumber, CultureInfo.InvariantCulture, out b))
                    return 0;
                addr = (addr << 8) | b;
            }
            return addr;
        }

        private static string EscapeJson(string s)
        {
            if (string.IsNullOrEmpty(s)) return "";
            return s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", "").Replace("\n", " ");
        }

        private static void WriteJsonError(string message)
        {
            Console.WriteLine("{\"type\":\"error\",\"message\":\"" + EscapeJson(message) + "\"}");
        }
    }
}
