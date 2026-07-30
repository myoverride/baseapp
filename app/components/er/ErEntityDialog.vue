<template>
  <v-dialog v-model="dialogOpen" max-width="450" persistent>
    <v-card>
      <v-toolbar color="primary" height="56">
        <v-icon class="ml-2 mr-2" color="white">mdi-cube-outline</v-icon>
        <v-toolbar-title class="text-subtitle-1 font-weight-bold">
          {{ isEdit ? $t('er.editEntity') : $t('er.createNewEntity') }}
        </v-toolbar-title>
        <v-spacer />
        <v-btn icon="mdi-close" variant="text" color="white" @click="close" />
      </v-toolbar>

      <v-card-text class="pa-5">
        <I18nTextField
          v-model="form.name"
          :label="$t('common.name')"
          required
        />
        <v-text-field
          v-model="form.slug"
          :label="$t('er.entitySlug')"
          variant="outlined"
          density="comfortable"
          :hint="$t('er.entitySlugHint')"
          :rules="[v => !!v || 'Slug zorunludur']"
        />
      </v-card-text>

      <v-divider />
      <v-card-actions class="pa-4">
        <v-spacer />
        <v-btn @click="close">{{ $t('common.cancel') }}</v-btn>
        <v-btn color="primary" variant="flat" @click="save" :disabled="!form.name || !form.slug">
          {{ isEdit ? $t('common.update') : $t('common.add') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
const props = defineProps<{
  modelValue: boolean
  entity?: any
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  save: [data: { name: string; slug: string }, entity?: any]
}>()

const form = ref({ name: '', slug: '' })

const isEdit = computed(() => props.entity != null)

const dialogOpen = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

watch(() => props.modelValue, (open) => {
  if (open) {
    if (props.entity) {
      form.value = { name: props.entity.name || '', slug: props.entity.slug || '' }
    } else {
      form.value = { name: '', slug: '' }
    }
  }
})

// Auto-generate slug from name
watch(() => form.value.name, (name) => {
  if (!isEdit.value && name) {
    let nameStr = name;
    if (name.startsWith('{') && name.endsWith('}')) {
      try {
        const parsed = JSON.parse(name);
        const firstKey = Object.keys(parsed)[0];
        nameStr = parsed['en'] || (firstKey ? parsed[firstKey] : '') || '';
      } catch (e) {
        nameStr = '';
      }
    }
    
    form.value.slug = nameStr
      .toLowerCase()
      .replace(/[ğ]/g, 'g').replace(/[ü]/g, 'u').replace(/[ş]/g, 's')
      .replace(/[ı]/g, 'i').replace(/[ö]/g, 'o').replace(/[ç]/g, 'c')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
  }
})

const close = () => {
  dialogOpen.value = false
}

const save = () => {
  emit('save', { ...form.value }, props.entity)
  close()
}
</script>
