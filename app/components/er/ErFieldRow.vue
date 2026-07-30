<template>
  <div
    class="er-field-row"
    :class="{
      'er-field-row--primary': field.isPrimary,
      'er-field-row--relation': field.type === 'relation',
      'er-field-row--hover': isHovered
    }"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
    @dblclick.stop="$emit('edit', field, index)"
  >
    <!-- Sol taraftaki kırmızı noktayı tamamen kaldırıyoruz -->

    <!-- Field icon -->
    <div class="er-field-icon">
      <v-icon :color="typeColor" size="12">{{ typeIcon }}</v-icon>
    </div>

    <!-- Field name -->
    <div class="er-field-name" :title="field.name">
      {{ $localize(field.label) || field.name }}
    </div>

    <!-- Indicators -->
    <div class="er-field-indicators">
      <span v-if="field.isPrimary" class="er-indicator er-indicator--primary" title="Birincil Alan">
        <v-icon size="10" color="amber-darken-2">mdi-key</v-icon>
      </span>
      <span v-if="field.required" class="er-indicator er-indicator--required" :title="$t('validation.required')">
        <v-icon size="10" color="red-darken-1">mdi-asterisk</v-icon>
      </span>
      <span v-if="field.unique" class="er-indicator er-indicator--unique" title="Benzersiz">
        <v-icon size="10" color="deep-purple-accent-3">mdi-fingerprint</v-icon>
      </span>
    </div>

    <!-- Type badge -->
    <div class="er-field-type" :style="{ backgroundColor: typeBgColor, color: typeColor }">
      {{ typeLabel }}
    </div>

    <!-- Hover actions -->
    <div v-show="isHovered" class="er-field-actions">
      <v-icon size="12" class="er-field-action" @click.stop="$emit('edit', field, index)" :title="$t('common.edit')">mdi-pencil</v-icon>
      <v-icon size="12" class="er-field-action er-field-action--delete" @click.stop="$emit('delete', field, index)" :title="$t('common.delete')">mdi-close</v-icon>
    </div>

    <!-- Connection anchor for relations -->
    <div
      v-if="field.type === 'relation'"
      class="er-field-anchor"
      :data-source-id="entityId"
      :data-field-name="field.name"
    >
      <div class="er-anchor-dot"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  field: any
  index: number
  entityId: number | string
}>()

defineEmits<{
  edit: [field: any, index: number]
  delete: [field: any, index: number]
}>()

const isHovered = ref(false)

const typeMap: Record<string, { icon: string; color: string; bg: string; label: string }> = {
  string:   { icon: 'mdi-format-text', color: '#1565C0', bg: '#E3F2FD', label: 'STR' },
  number:   { icon: 'mdi-numeric', color: '#2E7D32', bg: '#E8F5E9', label: 'NUM' },
  boolean:  { icon: 'mdi-toggle-switch-outline', color: '#6A1B9A', bg: '#F3E5F5', label: 'BOOL' },
  date:     { icon: 'mdi-calendar', color: '#E65100', bg: '#FFF3E0', label: 'DATE' },
  datetime: { icon: 'mdi-calendar-clock', color: '#E65100', bg: '#FFF3E0', label: 'DTTM' },
  time:     { icon: 'mdi-clock-outline', color: '#00695C', bg: '#E0F2F1', label: 'TIME' },
  array:    { icon: 'mdi-code-brackets', color: '#4527A0', bg: '#EDE7F6', label: 'ARR' },
  json:     { icon: 'mdi-code-json', color: '#37474F', bg: '#ECEFF1', label: 'JSON' },
  uuid:     { icon: 'mdi-identifier', color: '#795548', bg: '#EFEBE9', label: 'UUID' },
  enum:     { icon: 'mdi-format-list-bulleted', color: '#AD1457', bg: '#FCE4EC', label: 'ENUM' },
  relation: { icon: 'mdi-link-variant', color: '#C62828', bg: '#FFEBEE', label: 'REL' },
  password: { icon: 'mdi-form-textbox-password', color: '#212121', bg: '#E0E0E0', label: 'PWD' }
}

const typeInfo = computed(() => typeMap[props.field.type] || typeMap['string']!)
const typeIcon = computed(() => typeInfo.value.icon)
const typeColor = computed(() => typeInfo.value.color)
const typeBgColor = computed(() => typeInfo.value.bg)
const typeLabel = computed(() => typeInfo.value.label)
</script>

<style scoped>
.er-field-row {
  display: flex;
  align-items: center;
  padding: 3px 8px;
  gap: 5px;
  font-size: 11px;
  border-bottom: 1px solid rgba(0,0,0,0.04);
  position: relative;
  transition: background-color 0.15s ease;
  cursor: default;
  min-height: 24px;
}

.er-field-row:last-child {
  border-bottom: none;
}

.er-field-row--hover {
  background-color: rgba(25, 118, 210, 0.06);
}

.er-field-row--primary {
  background-color: rgba(255, 193, 7, 0.06);
}

.er-field-row--relation {
  background-color: rgba(198, 40, 40, 0.03);
}

.er-field-icon {
  flex-shrink: 0;
  width: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.er-field-name {
  flex: 1;
  min-width: 0;
  font-weight: 500;
  color: #263238;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  letter-spacing: -0.2px;
}

.er-field-indicators {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}

.er-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: 3px;
}

.er-field-type {
  flex-shrink: 0;
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.5px;
  line-height: 1.4;
}

.er-field-actions {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  gap: 2px;
  background: white;
  border-radius: 4px;
  padding: 1px 3px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.15);
  z-index: 5;
}

.er-field-action {
  cursor: pointer;
  opacity: 0.6;
  transition: opacity 0.15s;
}

.er-field-action:hover {
  opacity: 1;
}

.er-field-action--delete:hover {
  color: #C62828 !important;
}

/* Connection Anchors */
.er-field-anchor {
  position: absolute;
  top: 50%;
  right: -6px;
  transform: translateY(-50%);
  z-index: 10;
}

.er-anchor-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #1565C0;
  border: 2px solid #fff;
  box-shadow: 0 0 0 1px #1565C0;
  transition: transform 0.2s ease;
}

.er-anchor-dot:hover {
  transform: scale(1.4);
}
</style>
