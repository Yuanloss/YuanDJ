﻿// heart-rate.cs - BLE 心率采集（通用版）
// 编译: build.cmd 或 heart-rate.ps1（csc.exe / C# 5 语法）
// 注意: 本文件必须以 UTF-8 with BOM 保存，否则 csc 会按 GBK 解析中文注释
// 用法: heart-rate.exe scan | heart-rate.exe monitor <mac>
//
// 支持的设备：
//   1) 标准 BLE 心率设备：广播里带 0x180D 服务（Polar / Garmin / Coospo /
//      Magene / Wahoo / 华为/OPPO 等支持标准心率服务的表带、胸带）
//      → GATT 连接并订阅 Heart Rate Measurement(0x2A37) 通知
//   2) 小米手环/手表：厂商数据 0x0157，广播包里直接带心率
//      → 不连接，直接解析广播（原逻辑，保留兼容）
//
// monitor 策略：先尝试 GATT（通用路径），失败再回退到广播解析（小米路径）。
//
// 兼容说明：scan 输出的 JSON 字段保持向后兼容（type/id/name/address/model/
// data/hr），新增 hr_service 字段，前端无需改动。

using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices.WindowsRuntime;
using System.Threading;
using Windows.Devices.Bluetooth;
using Windows.Devices.Bluetooth.Advertisement;
using Windows.Devices.Bluetooth.GenericAttributeProfile;
using Windows.Foundation;
using Windows.Storage.Streams;

namespace HeartRateMonitor
{
    internal class Program
    {
        // 小米（含 Redmi）厂商 ID
        private const ushort MiCompanyId = 0x0157;
        // 标准心率服务 / 心率测量特征
        private static readonly Guid HeartRateServiceUuid =
            new Guid("0000180d-0000-1000-8000-00805f9b34fb");
        private static readonly Guid HeartRateMeasurementUuid =
            new Guid("00002a37-0000-1000-8000-00805f9b34fb");

        private const int DisconnectTimeoutSec = 30;
        private const int ScanDurationMs = 5000;
        // scan 时额外附带的无名设备上限（有名字但既非小米也不广播 0x180D 的设备）
        private const int MaxOtherDevices = 20;

        private static int Main(string[] args)
        {
            // stdout 固定 UTF-8：主进程按 UTF-8 解析，中文设备名/提示才不会乱码
            try { Console.OutputEncoding = System.Text.Encoding.UTF8; } catch { }
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

        // ===================== 扫描阶段 =====================

        private class ScanState
        {
            public readonly object Lock = new object();
            public readonly Dictionary<ulong, MergedDevice> Devices = new Dictionary<ulong, MergedDevice>();
            public int TotalAdvCount;
            public int MiAdvCount;
            public int HrServiceAdvCount;
        }

        private class MergedDevice
        {
            public ulong BluetoothAddress;
            public string Address;
            public string AdvName = "";
            public string ScanRespName = "";
            public byte[] MiData;
            public bool AdvertisesHrService;
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

            // 是否值得展示给用户：小米广播 / 广播 0x180D / 名字像心率设备
            public bool IsLikelyHeartRateDevice
            {
                get
                {
                    if (MiData != null) return true;
                    if (AdvertisesHrService) return true;
                    return LooksLikeHeartRateName(BestName);
                }
            }
        }

        private static ScanState _scanState;

        private static readonly string[] HeartRateNameHints = new string[]
        {
            "HEART", "HRM", "HXM", "CARDIO", "PULSE",
            "POLAR", "GARMIN", "COROS", "MAGENE", "COOSPO",
            "WAHOO", "SUUNTO", "SIGMA", "心率"
        };

        private static bool LooksLikeHeartRateName(string name)
        {
            if (string.IsNullOrEmpty(name)) return false;
            string upper = name.ToUpperInvariant();
            for (int i = 0; i < HeartRateNameHints.Length; i++)
            {
                if (upper.IndexOf(HeartRateNameHints[i], StringComparison.OrdinalIgnoreCase) >= 0)
                    return true;
            }
            return false;
        }

        private static int RunScan()
        {
            var state = new ScanState();
            _scanState = state;

            var watcher = new BluetoothLEAdvertisementWatcher();
            watcher.ScanningMode = BluetoothLEScanningMode.Active;
            // 允许 BLE 5.0 扩展广播（新版手环常用）
            watcher.AllowExtendedAdvertisements = true;

            var handler = new TypedEventHandler<BluetoothLEAdvertisementWatcher, BluetoothLEAdvertisementReceivedEventArgs>(OnScanReceived);
            EventRegistrationToken token = SubscribeEvent(watcher, "Received", handler);

            watcher.Start();
            Thread.Sleep(300);
            if (watcher.Status != BluetoothLEAdvertisementWatcherStatus.Started)
            {
                WriteJsonError("watcher failed to start, status: " + watcher.Status + "（请检查蓝牙开关与适配器）");
                try { watcher.Stop(); } catch { }
                try { UnsubscribeEvent(watcher, "Received", token); } catch { }
                return 1;
            }

            Thread.Sleep(ScanDurationMs);
            watcher.Stop();
            Thread.Sleep(300);
            try { UnsubscribeEvent(watcher, "Received", token); } catch { }

            var hrDevices = new List<MergedDevice>();
            var otherDevices = new List<MergedDevice>();

            lock (state.Lock)
            {
                foreach (var kvp in state.Devices)
                {
                    var d = kvp.Value;
                    if (d.IsLikelyHeartRateDevice)
                        hrDevices.Add(d);
                    else if (!string.IsNullOrEmpty(d.BestName))
                        otherDevices.Add(d);
                }
            }

            hrDevices.Sort(delegate (MergedDevice a, MergedDevice b)
            {
                return string.Compare(a.BestName, b.BestName, StringComparison.OrdinalIgnoreCase);
            });

            // 扫描到心率设备就写入本地缓存，供下次扫不到时兜底
            int cachedEmitted = 0;
            if (hrDevices.Count > 0) SaveHrDeviceCache(hrDevices);

            int count = 0;
            for (int i = 0; i < hrDevices.Count; i++)
            {
                EmitDevice(hrDevices[i], true);
                count++;
            }
            // 本次一个心率设备都没扫到：用上次的缓存补上（手环刚断开连接后常会暂停广播）
            if (hrDevices.Count == 0)
            {
                var cached = LoadHrDeviceCache();
                for (int i = 0; i < cached.Count; i++)
                {
                    Console.WriteLine("{\"type\":\"device\",\"id\":\"" + cached[i][0] +
                                      "\",\"name\":\"" + EscapeJson(cached[i][1]) +
                                      "\",\"address\":\"" + cached[i][0] +
                                      "\",\"model\":\"" + EscapeJson(cached[i][2]) +
                                      "\",\"data\":\"\",\"hr\":0,\"hr_service\":false,\"likely_hr\":true" +
                                      ",\"cached\":true,\"adv_name\":\"\",\"scan_resp_name\":\"\"}");
                    count++;
                }
                cachedEmitted = cached.Count;
            }
            // 兜底：一个心率设备都没识别到时，把周围有名字的 BLE 设备列出来，
            // 允许用户手动挑选后再尝试 GATT 连接（覆盖不广播 0x180D 的型号）。
            // 已经识别到心率设备（含缓存）时不列这些，避免下拉框被耳机/打印机等占满。
            int otherEmitted = 0;
            if (hrDevices.Count == 0 && cachedEmitted == 0)
            {
                for (int i = 0; i < otherDevices.Count && otherEmitted < MaxOtherDevices; i++)
                {
                    EmitDevice(otherDevices[i], false);
                    count++;
                    otherEmitted++;
                }
            }

            Console.WriteLine("{\"type\":\"scan_stats\",\"total_adv\":" + state.TotalAdvCount +
                              ",\"mi_adv\":" + state.MiAdvCount +
                              ",\"mi_device_count\":" + CountMiDevices(state) +
                              ",\"hr_service_count\":" + CountHrServiceDevices(state) +
                              ",\"cached_count\":" + cachedEmitted +
                              ",\"other_count\":" + otherEmitted + "}");
            Console.WriteLine("{\"type\":\"scan_complete\",\"count\":" + count + "}");
            return 0;
        }

        private static void EmitDevice(MergedDevice d, bool likelyHeartRate)
        {
            string model;
            if (d.MiData != null) model = "Xiaomi";
            else if (d.AdvertisesHrService) model = "BLE-HR";
            else model = "BLE";

            int hr = 0;
            string dataHex = "";
            if (d.MiData != null)
            {
                if (d.MiData.Length > 3) hr = d.MiData[3];
                dataHex = BitConverter.ToString(d.MiData).Replace("-", "");
            }

            Console.WriteLine("{\"type\":\"device\",\"id\":\"" + d.Address +
                              "\",\"name\":\"" + EscapeJson(d.BestName) +
                              "\",\"address\":\"" + d.Address +
                              "\",\"model\":\"" + model +
                              "\",\"data\":\"" + dataHex +
                              "\",\"hr\":" + hr +
                              ",\"hr_service\":" + (d.AdvertisesHrService ? "true" : "false") +
                              ",\"likely_hr\":" + (likelyHeartRate ? "true" : "false") +
                              ",\"adv_name\":\"" + EscapeJson(d.AdvName) +
                              "\",\"scan_resp_name\":\"" + EscapeJson(d.ScanRespName) +
                              "\"}");
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

        private static int CountHrServiceDevices(ScanState state)
        {
            int n = 0;
            lock (state.Lock)
            {
                foreach (var kvp in state.Devices)
                {
                    if (kvp.Value.AdvertisesHrService) n++;
                }
            }
            return n;
        }

        // ===== 心率设备缓存（TSV 三列：MAC / 名称 / 型号）=====
        // 放在 exe 同目录：打包模式下就是 %APPDATA%\YuanDJ，可写
        private static string GetCacheFilePath()
        {
            try
            {
                string dir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
                if (string.IsNullOrEmpty(dir)) return null;
                return Path.Combine(dir, "heart-rate-devices.txt");
            }
            catch { return null; }
        }

        private static void SaveHrDeviceCache(List<MergedDevice> devices)
        {
            string path = GetCacheFilePath();
            if (path == null) return;
            try
            {
                var sb = new System.Text.StringBuilder();
                for (int i = 0; i < devices.Count; i++)
                {
                    var d = devices[i];
                    string model = d.MiData != null ? "Xiaomi" : "BLE-HR";
                    string name = (d.BestName ?? "").Replace("\t", " ").Replace("\r", "").Replace("\n", " ");
                    sb.Append(d.Address).Append('\t').Append(name).Append('\t').Append(model).Append('\n');
                }
                File.WriteAllText(path, sb.ToString(), new System.Text.UTF8Encoding(false));
            }
            catch { }
        }

        private static List<string[]> LoadHrDeviceCache()
        {
            var list = new List<string[]>();
            string path = GetCacheFilePath();
            if (path == null) return list;
            try
            {
                if (!File.Exists(path)) return list;
                string[] lines = File.ReadAllLines(path, System.Text.Encoding.UTF8);
                for (int i = 0; i < lines.Length && list.Count < 10; i++)
                {
                    string line = lines[i];
                    if (string.IsNullOrEmpty(line)) continue;
                    string[] parts = line.Split('\t');
                    if (parts.Length < 3) continue;
                    if (ParseAddress(parts[0]) == 0) continue;
                    list.Add(parts);
                }
            }
            catch { }
            return list;
        }

        private static void OnScanReceived(BluetoothLEAdvertisementWatcher sender, BluetoothLEAdvertisementReceivedEventArgs args)
        {
            var state = _scanState;
            if (state == null) return;

            // 小米厂商数据
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

            // 是否广播标准心率服务
            bool hasHrService = false;
            foreach (Guid uuid in args.Advertisement.ServiceUuids)
            {
                if (uuid == HeartRateServiceUuid) { hasHrService = true; break; }
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

                // 合并 ADV 与 SCAN_RSP：名字和服务 UUID 可能分处两包
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

                if (hasHrService)
                {
                    dev.AdvertisesHrService = true;
                    state.HrServiceAdvCount++;
                }

                if (miData != null)
                {
                    state.MiAdvCount++;
                    dev.MiData = miData;
                }
            }
        }

        // ===================== 监测阶段 =====================

        private class MonitorState
        {
            public readonly object Lock = new object();
            public bool Connected;
            public int LastHR;
            public DateTime LastSeen = DateTime.UtcNow;
            public string DeviceName = "";
            public bool GattMode;
        }

        private static MonitorState _monitorState;
        private static ulong _monitorTargetAddr;
        private static string _monitorMac;

        // GATT 对象必须保持引用，避免被 GC 回收导致通知中断
        private static BluetoothLEDevice _gattDevice;
        private static GattDeviceService _gattService;
        private static GattCharacteristic _gattCharacteristic;
        private static EventRegistrationToken _gattValueToken;
        private static bool _gattValueSubscribed;
        // 后台重试预算与上次尝试时间（断开重连时 Windows 会短暂占用旧链路约 30 秒）
        private static int _gattRetryBudget;
        private static DateTime _lastGattAttempt;
        // 只提示一次的状态
        private static bool _noDataHintShown;
        private static bool _noLinkHintShown;

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

            // 广播监听同时承担：设备名来源 + 小米广播心率 + GATT 失败后的回退通道
            var watcher = new BluetoothLEAdvertisementWatcher();
            watcher.ScanningMode = BluetoothLEScanningMode.Active;
            watcher.AllowExtendedAdvertisements = true;

            var handler = new TypedEventHandler<BluetoothLEAdvertisementWatcher, BluetoothLEAdvertisementReceivedEventArgs>(OnMonitorReceived);
            EventRegistrationToken token = SubscribeEvent(watcher, "Received", handler);

            watcher.Start();
            Thread.Sleep(300);
            if (watcher.Status != BluetoothLEAdvertisementWatcherStatus.Started)
            {
                WriteJsonError("watcher failed to start, status: " + watcher.Status);
                try { watcher.Stop(); } catch { }
                try { UnsubscribeEvent(watcher, "Received", token); } catch { }
                return 1;
            }

            Console.WriteLine("{\"type\":\"status\",\"message\":\"monitoring " + EscapeJson(mac) + "\"}");

            // 通用路径：尝试 GATT 连接 + 订阅标准心率特征
            // Windows 在进程被强杀后可能还占着旧链路，设备也可能被手机 App 连着，
            // 这两种情况都会返回 AccessDenied / Unreachable，重试几次通常能拿到。
            Console.WriteLine("{\"type\":\"status\",\"message\":\"尝试连接标准心率服务(0x180D)…\"}");
            bool gattOk = false;
            for (int attempt = 1; attempt <= 4; attempt++)
            {
                bool retryable = false;
                try
                {
                    gattOk = TryConnectGatt(targetAddr, state, ref retryable);
                }
                catch (Exception ex)
                {
                    retryable = true;
                    Console.WriteLine("{\"type\":\"status\",\"message\":\"GATT 异常: " + EscapeJson(ex.Message) + "\"}");
                }

                if (gattOk) break;
                if (!retryable) break;          // 设备本身没有心率服务，重试也没用
                _gattRetryBudget = 4;           // 交给后台循环继续试
                if (attempt == 4) break;

                Console.WriteLine("{\"type\":\"status\",\"message\":\"GATT 被占用或暂无响应，3 秒后重试 (" + attempt + "/4)\"}");
                Thread.Sleep(3000);
            }
            _lastGattAttempt = DateTime.UtcNow;

            if (!gattOk)
            {
                Console.WriteLine("{\"type\":\"status\",\"message\":\"未建立标准心率连接，回退到广播解析（小米手环模式；后台仍会继续尝试）\"}");
            }

            var stopEvent = new ManualResetEventSlim(false);
            Console.CancelKeyPress += delegate (object s, ConsoleCancelEventArgs e) { e.Cancel = true; stopEvent.Set(); };

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
                if (shouldDisconnect) Console.WriteLine("{\"type\":\"disconnected\"}");

                // 连上了但一直没数据 / 一直没连上：各给一次明确提示，方便用户判断
                if (!_noDataHintShown && state.GattMode)
                {
                    lock (state.Lock)
                    {
                        if (state.LastHR <= 0 && (DateTime.UtcNow - state.LastSeen).TotalSeconds > 10)
                        {
                            _noDataHintShown = true;
                            Console.WriteLine("{\"type\":\"status\",\"message\":\"已连接但未收到心率数据：请佩戴手环并确认心率广播已开启\"}");
                        }
                    }
                }
                if (!_noLinkHintShown && !state.GattMode && _gattRetryBudget == 0)
                {
                    lock (state.Lock)
                    {
                        if (!state.Connected && (DateTime.UtcNow - state.LastSeen).TotalSeconds > 15)
                        {
                            _noLinkHintShown = true;
                            Console.WriteLine("{\"type\":\"status\",\"message\":\"暂未建立连接：请唤醒手环、靠近电脑，并断开手机上的小米运动健康\"}");
                        }
                    }
                }

                // 后台继续尝试 GATT：断开后立刻重连、或设备被手机 App 占用时，
                // 等旧链路释放后能自动接上，不需要用户再点一次「连接」。
                if (!state.GattMode && _gattRetryBudget > 0 &&
                    (DateTime.UtcNow - _lastGattAttempt).TotalSeconds >= 10)
                {
                    _lastGattAttempt = DateTime.UtcNow;
                    _gattRetryBudget--;
                    bool retryable = false;
                    bool ok = false;
                    try { ok = TryConnectGatt(targetAddr, state, ref retryable); }
                    catch { }
                    if (!ok && !retryable)
                    {
                        _gattRetryBudget = 0;
                    }
                }
            }

            // 清理
            try { watcher.Stop(); } catch { }
            try { UnsubscribeEvent(watcher, "Received", token); } catch { }
            CleanupGatt();
            return 0;
        }

        // 连接设备并订阅 0x2A37；成功返回 true。retryable 表示失败是否值得重试
        private static bool TryConnectGatt(ulong addr, MonitorState state, ref bool retryable)
        {
            BluetoothLEDevice device = null;
            try
            {
                device = BluetoothLEDevice.FromBluetoothAddressAsync(addr).GetAwaiter().GetResult();
                if (device == null)
                {
                    retryable = true;
                    Console.WriteLine("{\"type\":\"status\",\"message\":\"GATT: 无法获取设备对象（可能不在范围内）\"}");
                    return false;
                }

                var svcResult = device.GetGattServicesForUuidAsync(HeartRateServiceUuid, BluetoothCacheMode.Uncached)
                                      .GetAwaiter().GetResult();
                if (svcResult.Status != GattCommunicationStatus.Success || svcResult.Services.Count == 0)
                {
                    retryable = IsTransientGattStatus(svcResult.Status);
                    Console.WriteLine("{\"type\":\"status\",\"message\":\"GATT: 未发现心率服务，status=" + svcResult.Status + HintForStatus(svcResult.Status) + "\"}");
                    try { device.Dispose(); } catch { }
                    return false;
                }

                var service = svcResult.Services[0];
                var chrResult = service.GetCharacteristicsForUuidAsync(HeartRateMeasurementUuid, BluetoothCacheMode.Uncached)
                                      .GetAwaiter().GetResult();
                if (chrResult.Status != GattCommunicationStatus.Success || chrResult.Characteristics.Count == 0)
                {
                    retryable = IsTransientGattStatus(chrResult.Status);
                    Console.WriteLine("{\"type\":\"status\",\"message\":\"GATT: 未发现心率测量特征，status=" + chrResult.Status + HintForStatus(chrResult.Status) + "\"}");
                    try { service.Dispose(); } catch { }
                    try { device.Dispose(); } catch { }
                    return false;
                }

                var chr = chrResult.Characteristics[0];

                var valueHandler = new TypedEventHandler<GattCharacteristic, GattValueChangedEventArgs>(OnGattValueChanged);
                _gattValueToken = SubscribeEvent(chr, "ValueChanged", valueHandler);
                _gattValueSubscribed = true;

                // 优先 Notify，不支持再试 Indicate
                var status = chr.WriteClientCharacteristicConfigurationDescriptorAsync(
                    GattClientCharacteristicConfigurationDescriptorValue.Notify).GetAwaiter().GetResult();
                if (status != GattCommunicationStatus.Success)
                {
                    status = chr.WriteClientCharacteristicConfigurationDescriptorAsync(
                        GattClientCharacteristicConfigurationDescriptorValue.Indicate).GetAwaiter().GetResult();
                }
                if (status != GattCommunicationStatus.Success)
                {
                    retryable = IsTransientGattStatus(status);
                    Console.WriteLine("{\"type\":\"status\",\"message\":\"GATT: 订阅通知失败，status=" + status + HintForStatus(status) + "\"}");
                    try { UnsubscribeEvent(chr, "ValueChanged", _gattValueToken); } catch { }
                    _gattValueSubscribed = false;
                    try { service.Dispose(); } catch { }
                    try { device.Dispose(); } catch { }
                    return false;
                }

                // 保持引用，防止被 GC
                _gattDevice = device;
                _gattService = service;
                _gattCharacteristic = chr;

                string devName = device.Name;
                lock (state.Lock)
                {
                    state.GattMode = true;
                    state.Connected = true;
                    state.LastSeen = DateTime.UtcNow;
                    if (!string.IsNullOrEmpty(devName)) state.DeviceName = devName;
                }
                if (string.IsNullOrEmpty(devName)) devName = "BLE Heart Rate";

                Console.WriteLine("{\"type\":\"connected\",\"deviceId\":\"" + EscapeJson(_monitorMac) +
                                  "\",\"name\":\"" + EscapeJson(devName) + "\",\"mode\":\"gatt\"}");
                return true;
            }
            catch (Exception ex)
            {
                retryable = true;
                Console.WriteLine("{\"type\":\"status\",\"message\":\"GATT 连接失败: " + EscapeJson(ex.Message) + "\"}");
                try { if (device != null) device.Dispose(); } catch { }
                return false;
            }
        }

        // AccessDenied / Unreachable 多为链路被占用或设备休眠，值得重试
        private static bool IsTransientGattStatus(GattCommunicationStatus status)
        {
            return status == GattCommunicationStatus.AccessDenied
                || status == GattCommunicationStatus.Unreachable
                || status == GattCommunicationStatus.ProtocolError;
        }

        private static string HintForStatus(GattCommunicationStatus status)
        {
            if (status == GattCommunicationStatus.AccessDenied)
                return "（设备被占用：请断开手机上的小米运动健康等 App，或等几秒重试）";
            if (status == GattCommunicationStatus.Unreachable)
                return "（设备不在范围内或已休眠，请戴在手上唤醒后重试）";
            return "";
        }

        private static void CleanupGatt()
        {
            try
            {
                if (_gattCharacteristic != null)
                {
                    _gattCharacteristic.WriteClientCharacteristicConfigurationDescriptorAsync(
                        GattClientCharacteristicConfigurationDescriptorValue.None).GetAwaiter().GetResult();
                }
            }
            catch { }
            try { if (_gattValueSubscribed) UnsubscribeEvent(_gattCharacteristic, "ValueChanged", _gattValueToken); } catch { }
            _gattValueSubscribed = false;
            try { if (_gattService != null) _gattService.Dispose(); } catch { }
            try { if (_gattDevice != null) _gattDevice.Dispose(); } catch { }
            _gattCharacteristic = null;
            _gattService = null;
            _gattDevice = null;
        }

        // 标准 Heart Rate Measurement 特征解析（Bluetooth SIG）
        private static void OnGattValueChanged(GattCharacteristic sender, GattValueChangedEventArgs args)
        {
            var state = _monitorState;
            if (state == null) return;

            byte[] data;
            try
            {
                var reader = DataReader.FromBuffer(args.CharacteristicValue);
                data = new byte[reader.UnconsumedBufferLength];
                reader.ReadBytes(data);
            }
            catch { return; }

            if (data.Length < 2) return;

            int hr;
            if ((data[0] & 0x01) != 0)
            {
                // bit0 = 1：心率是 uint16 小端
                if (data.Length < 3) return;
                hr = data[1] | (data[2] << 8);
            }
            else
            {
                hr = data[1];
            }

            EmitHeartRate(state, hr);
        }

        private static void EmitHeartRate(MonitorState state, int hr)
        {
            if (hr <= 0 || hr == 0xFF) return;

            bool changed = false;
            long ts = 0;
            lock (state.Lock)
            {
                state.LastSeen = DateTime.UtcNow;
                if (!state.Connected)
                {
                    state.Connected = true;
                    if (string.IsNullOrEmpty(state.DeviceName)) state.DeviceName = "BLE Heart Rate";
                }
                if (hr != state.LastHR)
                {
                    state.LastHR = hr;
                    ts = new DateTimeOffset(DateTime.UtcNow).ToUnixTimeSeconds();
                    changed = true;
                }
            }

            if (changed)
            {
                Console.WriteLine("{\"type\":\"heart_rate\",\"hr\":" + hr + ",\"timestamp\":" + ts + "}");
            }
        }

        // 广播通道（小米手环 / 作为 GATT 失败时的回退）
        private static void OnMonitorReceived(BluetoothLEAdvertisementWatcher sender, BluetoothLEAdvertisementReceivedEventArgs args)
        {
            var state = _monitorState;
            if (state == null) return;
            if (args.BluetoothAddress != _monitorTargetAddr) return;

            // GATT 通道已建立时，忽略广播，避免两路心率互相覆盖
            if (state.GattMode) return;

            bool sendConnected;
            lock (state.Lock)
            {
                state.LastSeen = DateTime.UtcNow;
                sendConnected = !state.Connected;
                if (sendConnected) state.Connected = true;

                string name = args.Advertisement.LocalName ?? "";
                if (!string.IsNullOrEmpty(name)) state.DeviceName = name;
            }

            if (sendConnected)
            {
                string name = state.DeviceName;
                if (string.IsNullOrEmpty(name)) name = "BLE Heart Rate";
                Console.WriteLine("{\"type\":\"connected\",\"deviceId\":\"" + EscapeJson(_monitorMac) +
                                  "\",\"name\":\"" + EscapeJson(name) + "\",\"mode\":\"adv\"}");
            }

            int hr;
            if (TryExtractXiaomiHeartRate(args.Advertisement, out hr))
            {
                EmitHeartRate(state, hr);
            }
        }

        // ===================== WinRT 事件订阅（反射，兼容 C# 5 投影） =====================

        private static EventRegistrationToken SubscribeEvent(object target, string eventName, Delegate handler)
        {
            Type t = target.GetType();
            MethodInfo add = t.GetMethod("add_" + eventName,
                BindingFlags.Instance | BindingFlags.Public | BindingFlags.InvokeMethod);
            if (add != null) return (EventRegistrationToken)add.Invoke(target, new object[] { handler });

            return (EventRegistrationToken)t.InvokeMember("add_" + eventName,
                BindingFlags.Instance | BindingFlags.Public | BindingFlags.InvokeMethod,
                null, target, new object[] { handler });
        }

        private static void UnsubscribeEvent(object target, string eventName, EventRegistrationToken token)
        {
            Type t = target.GetType();
            MethodInfo remove = t.GetMethod("remove_" + eventName,
                BindingFlags.Instance | BindingFlags.Public | BindingFlags.InvokeMethod);
            if (remove != null)
            {
                remove.Invoke(target, new object[] { token });
                return;
            }
            t.InvokeMember("remove_" + eventName,
                BindingFlags.Instance | BindingFlags.Public | BindingFlags.InvokeMethod,
                null, target, new object[] { token });
        }

        // ===================== 工具方法 =====================

        // 小米手环广播格式: [head, op, status, hr, ...]
        private static bool TryExtractXiaomiHeartRate(BluetoothLEAdvertisement adv, out int hr)
        {
            hr = 0;
            foreach (var md in adv.ManufacturerData)
            {
                if (md.CompanyId != MiCompanyId) continue;

                var reader = DataReader.FromBuffer(md.Data);
                byte[] data = new byte[reader.UnconsumedBufferLength];
                reader.ReadBytes(data);

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
