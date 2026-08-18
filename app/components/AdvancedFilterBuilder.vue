<template>
  <v-card class="pa-4 elevation-3 filter-builder">
    <v-card-title class="px-0 pt-0 d-flex align-center">
      <v-icon icon="mdi-filter-cog-outline" class="mr-2" :color="color"></v-icon>
      {{ $t('common.advancedFilters') }}
      <v-spacer></v-spacer>
      <v-btn icon="mdi-close" variant="text" size="small" @click="$emit('close')" />
    </v-card-title>
    
    <v-divider class="mb-4"></v-divider>

    <!-- Recursive Group Rendering -->
    <FilterGroupNode
      :group="localGroup"
      :columns="columns"
      @update="onGroupUpdate"
      is-root
    />

    <v-divider class="mt-4 mb-4"></v-divider>

    <v-card-actions class="px-0 pb-0">
      <v-btn variant="text" @click="resetFilters" color="error" prepend-icon="mdi-delete-sweep-outline">
        {{ $t('common.clear') }}
      </v-btn>
      <v-spacer></v-spacer>
      <v-btn :color="color" @click="applyFilters" prepend-icon="mdi-check">
        {{ $t('filter.apply') }}
      </v-btn>
    </v-card-actions>
  </v-card>
</template>

<script setup lang="ts">
const { primaryColor: color } = useGlobals();
import { ref, watch } from 'vue'
import type { FilterGroup } from '../utils/filterTypes'
import FilterGroupNode from './FilterGroupNode.vue'

interface Column {
  key: string
  title: string
  type?: string
}

const props = defineProps<{
  modelValue: FilterGroup | null,
  columns: Column[]
}>()

const emit = defineEmits(['update:modelValue', 'close', 'apply'])

// Initialize with a default empty group if null
const createEmptyGroup = (): FilterGroup => ({
  logic: 'AND',
  conditions: []
})

const localGroup = ref<FilterGroup>(
  props.modelValue ? JSON.parse(JSON.stringify(props.modelValue)) : createEmptyGroup()
)

watch(() => props.modelValue, (newVal) => {
  if (newVal) {
    localGroup.value = JSON.parse(JSON.stringify(newVal))
  } else {
    localGroup.value = createEmptyGroup()
  }
}, { deep: true })

const onGroupUpdate = (updatedGroup: FilterGroup) => {
  localGroup.value = updatedGroup
}

const resetFilters = () => {
  localGroup.value = createEmptyGroup()
  emit('update:modelValue', null)
  emit('apply')
}

const applyFilters = () => {
  if (localGroup.value.conditions.length === 0) {
    emit('update:modelValue', null)
  } else {
    emit('update:modelValue', localGroup.value)
  }
  emit('apply')
}
</script>

<style scoped>
.filter-builder {
  min-width: 500px;
  max-width: 800px;
}
</style>
