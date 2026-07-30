<template>
  <div class="i18n-text-field mb-4">
    <v-text-field
      v-model="values[activeTab]"
      :label="label"
      :placeholder="placeholder ? `${placeholder} (${activeLangName})` : `Değer girin (${activeLangName})`"
      variant="outlined"
      density="compact"
      hide-details
      @update:model-value="emitChange"
    >
      <template v-slot:append-inner>
        <v-select
          v-model="activeTab"
          :items="availableLocales"
          item-title="code"
          item-value="code"
          variant="plain"
          density="compact"
          hide-details
          menu-icon="mdi-chevron-down"
          class="i18n-lang-select pt-0 mt-0"
          style="width: 70px; max-width: 70px; flex: none;"
        >
          <template v-slot:selection="{ item }">
            <span class="text-uppercase font-weight-bold text-caption d-flex align-center" :style="{ color: color }">
              {{ item.title || item.value || activeTab }}
            </span>
          </template>
          <template v-slot:item="{ props }">
            <v-list-item v-bind="props" density="compact">
              <template v-slot:title>
                <div class="d-flex align-center">
                  <span class="text-uppercase text-caption">{{ props.title || props.value }}</span>
                </div>
              </template>
            </v-list-item>
          </template>
        </v-select>
      </template>
    </v-text-field>
    <div v-if="hint" class="text-caption text-grey-darken-1 mt-1 ml-1">{{ hint }}</div>
  </div>
</template>

<script setup lang="ts">
const { primaryColor: color } = useSysVars();
import { ref, watch, onMounted, computed } from 'vue';
import { useState } from '#app';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  modelValue: string | Record<string, string>;
  locale?: string;
  label?: string;
  placeholder?: string;
  hint?: string;
  required?: boolean;
}>();

const emit = defineEmits(['update:modelValue', 'update:locale']);

const availableLocales = useState<any[]>('app_locales', () => []);
const { locale } = useI18n();

const activeTab = ref(props.locale || locale.value || 'en');
const values = ref<Record<string, string>>({});

watch(activeTab, (newTab) => {
  emit('update:locale', newTab);
});

const activeLangName = computed(() => {
  const lang = availableLocales.value.find((l: any) => l.code === activeTab.value);
  return lang ? lang.name : activeTab.value.toUpperCase();
});

const parseValue = (val: string | Record<string, string>) => {
  if (!val) return {};
  if (typeof val === 'object') {
    return { ...val };
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        return JSON.parse(trimmed);
      } catch {
        // Fallback
      }
    }
    // Plain string, assume it's for current locale or first available
    return { [locale.value || 'en']: val };
  }
  return {};
};

// Init
values.value = parseValue(props.modelValue);

// Watch for external changes
watch(() => props.modelValue, (newVal) => {
  // Only update if fundamentally different to avoid overwriting ongoing typing
  const parsed = parseValue(newVal);
  if (JSON.stringify(parsed) !== JSON.stringify(values.value)) {
    values.value = parsed;
  }
}, { deep: true });

const emitChange = () => {
  // Filter out empty strings
  const cleaned: Record<string, string> = {};
  for (const [k, v] of Object.entries(values.value)) {
    if (v !== null && v !== undefined && v.trim() !== '') {
      cleaned[k] = v;
    }
  }

  if (typeof props.modelValue === 'object') {
    emit('update:modelValue', cleaned);
  } else {
    // If it was a string, emit stringified JSON if multiple, or plain if none/empty?
    // Always emit JSON string to be safe and consistent for localization.
    emit('update:modelValue', Object.keys(cleaned).length > 0 ? JSON.stringify(cleaned) : '');
  }
};
</script>

<style scoped>
.i18n-lang-select :deep(.v-field__input) {
  padding-top: 0 !important;
  padding-bottom: 0 !important;
  min-height: 24px !important;
  padding-right: 0 !important;
}
.i18n-lang-select :deep(.v-field__append-inner) {
  padding-top: 0 !important;
}
</style>
