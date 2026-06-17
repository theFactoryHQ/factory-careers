<script setup lang="ts">
import { Calendar, Check, ChevronLeft, ChevronRight, X } from 'lucide-vue-next'
import { todayDateInputValue } from '~~/shared/date-input'

defineOptions({
  inheritAttrs: false,
})

const props = withDefaults(defineProps<{
  id?: string
  modelValue?: string
  placeholder?: string
  clearLabel?: string
  allowClear?: boolean
  disabled?: boolean
  class?: string
}>(), {
  modelValue: '',
  placeholder: 'Select date',
  clearLabel: 'Clear date',
  allowClear: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

type CalendarDay = {
  date: string
  day: number
  isCurrentMonth: boolean
  isSelected: boolean
  isToday: boolean
}

const generatedId = useId()
const pickerId = computed(() => props.id ?? generatedId)
const panelId = computed(() => `${pickerId.value}-calendar`)
const open = ref(false)
const rootRef = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLButtonElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)

function toLocalDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseDateValue(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const parts = value.split('-').map(Number)
  const year = parts[0]
  const month = parts[1]
  const day = parts[2]
  if (year == null || month == null || day == null) return null
  const parsed = new Date(year, month - 1, day)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function monthForValue(value: string | null | undefined): Date {
  const parsed = parseDateValue(value)
  if (parsed) return new Date(parsed.getFullYear(), parsed.getMonth(), 1)
  const today = parseDateValue(todayDateInputValue()) ?? new Date()
  return new Date(today.getFullYear(), today.getMonth(), 1)
}

const calendarMonth = ref(monthForValue(props.modelValue))

const selectedDate = computed(() => props.modelValue || '')
const displayValue = computed(() => {
  const parsed = parseDateValue(selectedDate.value)
  if (!parsed) return ''
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
})

const calendarMonthLabel = computed(() =>
  calendarMonth.value.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
)

const calendarDays = computed<CalendarDay[]>(() => {
  const year = calendarMonth.value.getFullYear()
  const month = calendarMonth.value.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startPad = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1
  const today = todayDateInputValue()
  const days: CalendarDay[] = []

  for (let i = startPad - 1; i >= 0; i--) {
    const date = new Date(year, month, -i)
    const dateValue = toLocalDateString(date)
    days.push({
      date: dateValue,
      day: date.getDate(),
      isCurrentMonth: false,
      isSelected: dateValue === selectedDate.value,
      isToday: dateValue === today,
    })
  }

  for (let day = 1; day <= lastDay.getDate(); day++) {
    const date = new Date(year, month, day)
    const dateValue = toLocalDateString(date)
    days.push({
      date: dateValue,
      day,
      isCurrentMonth: true,
      isSelected: dateValue === selectedDate.value,
      isToday: dateValue === today,
    })
  }

  const remaining = 42 - days.length
  for (let i = 1; i <= remaining; i++) {
    const date = new Date(year, month + 1, i)
    const dateValue = toLocalDateString(date)
    days.push({
      date: dateValue,
      day: date.getDate(),
      isCurrentMonth: false,
      isSelected: dateValue === selectedDate.value,
      isToday: dateValue === today,
    })
  }

  return days
})

const { floatingStyle } = useFloatingMenu({
  open,
  triggerRef,
  width: 320,
  estimatedHeight: 360,
  zIndex: 85,
})

watch(() => props.modelValue, (value) => {
  const parsed = parseDateValue(value)
  if (!parsed || open.value) return
  calendarMonth.value = new Date(parsed.getFullYear(), parsed.getMonth(), 1)
})

function close(restoreFocus = false) {
  open.value = false
  if (restoreFocus) nextTick(() => triggerRef.value?.focus())
}

function toggleOpen() {
  if (props.disabled) return
  open.value = !open.value
  if (open.value) calendarMonth.value = monthForValue(props.modelValue)
}

function previousMonth() {
  calendarMonth.value = new Date(calendarMonth.value.getFullYear(), calendarMonth.value.getMonth() - 1, 1)
}

function nextMonth() {
  calendarMonth.value = new Date(calendarMonth.value.getFullYear(), calendarMonth.value.getMonth() + 1, 1)
}

function selectDate(value: string) {
  emit('update:modelValue', value)
  close(true)
}

function selectToday() {
  selectDate(todayDateInputValue())
}

function clearDate() {
  emit('update:modelValue', '')
  close(true)
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    close(true)
  }
}

useOutsidePointer({
  root: [rootRef, panelRef],
  active: open,
  eventName: 'click',
  onOutside: () => close(),
})
</script>

<template>
  <div ref="rootRef" class="factory-filter-dropdown relative" :class="class">
    <button
      ref="triggerRef"
      :id="pickerId"
      type="button"
      class="factory-filter-select factory-filter-dropdown-trigger flex min-h-10 w-full items-center justify-between gap-3 border py-2 pl-3 text-left text-sm outline-none transition-colors"
      :class="allowClear && modelValue ? 'pr-16' : 'pr-3'"
      :disabled="disabled"
      :aria-expanded="open"
      :aria-controls="panelId"
      aria-haspopup="dialog"
      v-bind="$attrs"
      @click="toggleOpen"
      @keydown="handleKeydown"
    >
      <span class="flex min-w-0 items-center gap-2">
        <Calendar class="size-3.5 shrink-0 text-surface-500 dark:text-surface-400" />
        <span
          class="truncate"
          :class="displayValue ? 'text-surface-900 dark:text-surface-100' : 'text-surface-500 dark:text-surface-400'"
        >
          {{ displayValue || placeholder }}
        </span>
      </span>
      <ChevronRight
        class="size-3.5 shrink-0 rotate-90 text-surface-500 transition-transform duration-150 dark:text-surface-400"
        :class="{ '-rotate-90': open }"
      />
    </button>
    <button
      v-if="allowClear && modelValue"
      type="button"
      class="absolute right-8 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center text-surface-400 transition-colors hover:bg-white/8 hover:text-surface-100 focus:outline-none focus:ring-2 focus:ring-brand-500/25"
      :aria-label="clearLabel"
      @click.stop="clearDate"
    >
      <X class="size-3.5" />
    </button>

    <Teleport to="body">
      <div
        v-if="open"
        :id="panelId"
        ref="panelRef"
        class="factory-filter-dropdown-menu factory-dashboard-portal border p-3"
        :style="floatingStyle"
        role="dialog"
        :aria-label="`${placeholder} calendar`"
        @keydown="handleKeydown"
      >
        <div class="flex items-center justify-between gap-2">
          <button
            type="button"
            class="ui-button ui-button-ghost size-8 p-0"
            aria-label="Previous month"
            @click="previousMonth"
          >
            <ChevronLeft class="size-4" />
          </button>
          <span class="min-w-0 truncate text-sm font-semibold text-surface-900 dark:text-surface-100">
            {{ calendarMonthLabel }}
          </span>
          <button
            type="button"
            class="ui-button ui-button-ghost size-8 p-0"
            aria-label="Next month"
            @click="nextMonth"
          >
            <ChevronRight class="size-4" />
          </button>
        </div>

        <div class="mt-3 grid grid-cols-7 text-center">
          <div
            v-for="day in ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']"
            :key="day"
            class="pb-1.5 text-[11px] font-medium text-surface-400 dark:text-surface-500"
          >
            {{ day }}
          </div>
        </div>

        <div class="grid grid-cols-7 gap-1">
          <button
            v-for="day in calendarDays"
            :key="day.date"
            type="button"
            data-testid="dashboard-date-picker-day"
            class="relative flex h-8 items-center justify-center text-[13px] transition-colors"
            :class="[
              day.isSelected
                ? 'bg-brand-600 text-white shadow-sm shadow-brand-500/25'
                : day.isToday
                  ? 'border border-brand-500/45 text-brand-300'
                  : day.isCurrentMonth
                    ? 'text-surface-700 hover:bg-surface-100 dark:text-surface-300 dark:hover:bg-white/8'
                    : 'text-surface-300 hover:bg-surface-100 dark:text-surface-600 dark:hover:bg-white/5',
            ]"
            :aria-pressed="day.isSelected"
            @click="selectDate(day.date)"
          >
            <span>{{ day.day }}</span>
            <Check
              v-if="day.isSelected"
              class="absolute bottom-0.5 right-0.5 size-2.5"
            />
          </button>
        </div>

        <div class="mt-3 flex items-center justify-between border-t border-surface-200 pt-3 dark:border-surface-800">
          <button
            type="button"
            class="ui-button ui-button-secondary h-8 px-3 text-xs"
            @click="selectToday"
          >
            Today
          </button>
          <button
            v-if="allowClear"
            type="button"
            class="ui-button ui-button-ghost h-8 px-3 text-xs"
            @click="clearDate"
          >
            Clear
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>
