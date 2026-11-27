<template>
  <div class="custom-select" ref="selectRef">
    <button class="custom-select-trigger" @click.stop="toggleOpen" :disabled="disabled">
      <span class="custom-select-text">{{ currentLabel }}</span>
      <span class="custom-select-arrow" :class="{ open: isOpen }">▾</span>
    </button>
    <div v-show="isOpen" class="custom-select-menu">
      <div
        v-for="opt in options"
        :key="opt.value"
        class="custom-select-item"
        :class="{ active: opt.value === modelValue }"
        @click="selectItem(opt.value)"
      >{{ opt.label }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'

interface Option {
  value: string | number
  label: string
}

const props = withDefaults(defineProps<{
  modelValue: string | number
  options: Option[]
  placeholder?: string
  disabled?: boolean
}>(), {
  placeholder: '',
  disabled: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string | number]
}>()

const selectRef = ref<HTMLElement | null>(null)
const isOpen = ref(false)

const currentLabel = computed(() => {
  const opt = props.options.find(o => o.value === props.modelValue)
  return opt ? opt.label : props.placeholder
})

function toggleOpen() {
  if (props.disabled) return
  isOpen.value = !isOpen.value
}

function selectItem(value: string | number) {
  emit('update:modelValue', value)
  isOpen.value = false
}

function handleClickOutside(e: MouseEvent) {
  if (selectRef.value && !selectRef.value.contains(e.target as Node)) {
    isOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style scoped>
.custom-select {
  position: relative;
  min-width: 0;
}
.custom-select-trigger {
  display: flex; align-items: center; justify-content: space-between;
  width: 100%; height: 24px; padding: 0 6px;
  font-size: 11px; font-family: inherit;
  background: var(--input-bg); border: 1px solid var(--input-border);
  color: var(--text-primary); outline: none; cursor: pointer;
  border-radius: 0; box-shadow: none; box-sizing: border-box;
  line-height: 24px;
}
.custom-select-trigger:hover:not(:disabled) { border-color: var(--accent); }
.custom-select-trigger:disabled { opacity: 0.5; cursor: default; }
.custom-select-text {
  flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  text-align: left;
}
.custom-select-arrow {
  flex-shrink: 0; font-size: 10px; color: var(--text-muted);
  margin-left: 4px; transition: transform 0.15s;
}
.custom-select-arrow.open { transform: rotate(180deg); }
.custom-select-menu {
  position: absolute; top: 100%; left: 0; right: 0; z-index: 100;
  max-height: 300px; overflow-y: auto;
  background: var(--bg-tertiary); border: 1px solid var(--border);
  scrollbar-width: none;
}
.custom-select-menu::-webkit-scrollbar { display: none; }
.custom-select-item {
  padding: 4px 8px; font-size: 11px; color: var(--text-primary);
  cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.custom-select-item:hover { background: var(--accent); color: #fff; }
.custom-select-item.active { background: var(--accent); color: #fff; }
</style>
