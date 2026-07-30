<template>
  <v-dialog v-model="dialogOpen"  fullscreen>
    <v-card>
      <v-toolbar :color="color" height="56">
        <v-icon class="ml-2 mr-2" color="white">mdi-form-textbox</v-icon>
        <v-toolbar-title class="text-subtitle-1 font-weight-bold">
          {{ isEdit ? $t('er.editField') : $t('er.addNewField') }}
        </v-toolbar-title>
        <v-spacer />
        <v-btn icon="mdi-close" variant="text" color="white" @click="close" />
      </v-toolbar>

      <v-card-text class="pa-5">
        <v-row>
          <v-col cols="12" sm="4">
            <v-text-field
              v-model="form.name"
              :label="$t('common.fieldName')"
              variant="outlined"
              density="comfortable"
              :rules="[v => !!v || $t('er.fieldNameRequired')]"
              autofocus
            />
          </v-col>
          <v-col cols="12" sm="4">
            <I18nTextField
              v-model="form.label"
              :label="$t('common.name')"
            />
          </v-col>
          <v-col cols="12" sm="4">
            <v-select
              v-model="form.type"
              :items="fieldTypes"
              :label="$t('field.dataType')"
              variant="outlined"
              density="comfortable"
              @update:model-value="onTypeChange"
            />
          </v-col>
        </v-row>

        <!-- Relation target -->
        <v-select
          v-if="form.type === 'relation'"
          v-model="form.targetEntityId"
          :items="localizedEntities"
          item-title="displayName"
          item-value="id"
          :label="$t('common.target')"
          variant="outlined"
          density="comfortable"
          :rules="[v => !!v || $t('er.targetEntityRequired')]"
          class="mb-2"
        />

        <v-select
          v-if="form.type === 'relation'"
          v-model="form.onDelete"
          :items="relationOnDeleteOptions"
          item-title="title"
          item-value="value"
          :label="$t('field.onDelete')"
          variant="outlined"
          density="comfortable"
          class="mb-2"
        />

        <!-- Enum options -->
        <!-- Enum options -->
        <div v-if="form.type === 'enum'" class="mb-2 border rounded pa-2 bg-grey-lighten-4">
          <div class="d-flex justify-space-between align-center mb-2">
            <span class="text-caption font-weight-bold">{{ $t('common.optionsPressEnterToAdd') }}</span>
            <v-btn size="x-small" :color="color" variant="tonal" prepend-icon="mdi-plus" @click="form.options.push('')">Ekle</v-btn>
          </div>
          <div v-for="(opt, optIdx) in form.options" :key="optIdx" class="d-flex align-start mb-2">
            <div class="flex-grow-1">
              <I18nTextField v-model="(form.options[optIdx] as string)" :placeholder="'Seçenek ' + (optIdx + 1)" />
            </div>
            <v-btn icon="mdi-delete" color="red" variant="text" size="small" class="mt-1 ml-1" @click="form.options.splice(optIdx, 1)"></v-btn>
          </div>
          <div v-if="form.options.length === 0" class="text-caption text-error">{{ $t('common.addAtLeastOneOption') }}</div>
        </div>

        <!-- Password hash algorithm -->
        <v-select
          v-if="form.type === 'password'"
          v-model="form.hashAlgorithm"
          :items="[
            { title: $t('common.plainText'), value: 'plain' },
            { title: 'Bcrypt Hashing', value: 'bcrypt' },
            { title: 'SHA-256 Hashing', value: 'sha256' }
          ]"
          item-title="title"
          item-value="value"
          :label="$t('er.hashMethod')"
          variant="outlined"
          density="comfortable"
          class="mb-2"
        />

        <!-- Switches row -->
        <div class="d-flex flex-wrap ga-4 mt-2">
          <v-switch
            v-model="form.required"
            :label="$t('validation.required')"
            :color="color"
            hide-details
            density="compact"
          />
          <v-switch
            v-model="form.unique"
            :label="$t('field.unique')"
            color="deep-purple"
            hide-details
            density="compact"
          />
          <v-switch
            v-model="form.isPrimary"
            :label="$t('er.primaryName')"
            color="amber-darken-2"
            hide-details
            density="compact"
          />
          <v-switch
            v-model="form.showInTable"
            :label="$t('common.showInTable')"
            color="info"
            hide-details
            density="compact"
          />
        </div>

        <!-- Validation Rules -->
        <v-divider class="my-4" />
        <div class="d-flex align-center justify-space-between mb-3">
          <span class="text-subtitle-2 font-weight-bold text-grey-darken-2">{{ $t('er.validationRules') }}</span>
          <v-btn
            size="small"
            color="blue-grey"
            variant="tonal"
            prepend-icon="mdi-plus"
            @click="addRule"
            :disabled="availableRules.length === 0"
          >
            {{ $t('common.addRule') }}
          </v-btn>
        </div>

        <div v-for="(rule, rIdx) in form.rulesList" :key="rIdx" class="d-flex ga-2 align-center mb-2">
          <v-select
            v-model="rule.type"
            :items="availableRules"
            item-title="title"
            item-value="value"
            :label="$t('field.rule')"
            density="compact"
            variant="outlined"
            hide-details
            style="flex: 2;"
            @update:model-value="rule.value = null"
          />
          <v-text-field
            v-if="requiresValue(rule.type)"
            v-model="rule.value"
            :label="$t('common.value')"
            density="compact"
            variant="outlined"
            hide-details
            style="flex: 1;"
          />
          <I18nTextField
            v-model="rule.message"
            :label="$t('common.errorMessage')"
            style="flex: 2;"
          />
          <v-btn
            icon="mdi-close"
            color="red"
            variant="text"
            size="small"
            @click="form.rulesList.splice(rIdx, 1)"
          />
        </div>
      </v-card-text>

      <v-divider />
      <v-card-actions class="pa-4">
        <v-spacer />
        <v-btn @click="close">{{ $t('common.cancel') }}</v-btn>
        <v-btn :color="color" variant="flat" @click="save" :disabled="!form.name">
          {{ isEdit ? $t('common.update') : $t('common.add') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
const { primaryColor: color } = useSysVars();
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
const { $localize } = useNuxtApp()
const props = defineProps<{
  modelValue: boolean
  field?: any
  fieldIndex?: number
  entities: any[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  save: [field: any, index: number | undefined]
}>()

const fieldTypes = ['string', 'number', 'boolean', 'date', 'datetime', 'time', 'array', 'json', 'uuid', 'enum', 'relation', 'password']

const defaultForm = () => ({
  name: '',
  label: '',
  type: 'string',
  required: false,
  unique: false,
  isPrimary: false,
  showInTable: true,
  targetEntityId: null,
  onDelete: 'restrict',
  options: [] as string[],
  hashAlgorithm: 'plain',
  rulesList: [] as any[]
})

const form = ref(defaultForm())

const isEdit = computed(() => props.field != null)

const dialogOpen = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

watch(() => props.modelValue, (open) => {
  if (open) {
    if (props.field) {
      form.value = {
        name: props.field.name || '',
        label: props.field.label || '',
        type: props.field.type || 'string',
        required: props.field.required || false,
        unique: props.field.unique || false,
        isPrimary: props.field.isPrimary || false,
        showInTable: props.field.showInTable !== false,
        targetEntityId: props.field.targetEntityId || null,
        onDelete: props.field.onDelete || 'restrict',
        options: props.field.options ? [...props.field.options] : [],
        hashAlgorithm: props.field.hashAlgorithm || 'plain',
        rulesList: props.field.rulesList ? props.field.rulesList.map((r: any) => ({ ...r })) : []
      }
    } else {
      form.value = defaultForm()
    }
  }
})

const onTypeChange = () => {
  form.value.rulesList = []
  if (form.value.type !== 'relation') {
    form.value.targetEntityId = null
    form.value.onDelete = 'restrict'
  } else if (!form.value.onDelete) {
    form.value.onDelete = 'restrict'
  }
  form.value.options = []
}

const relationOnDeleteOptions = computed(() => {
  const options = [
    { title: 'Restrict', value: 'restrict' },
    { title: 'Cascade', value: 'cascade' }
  ]

  if (!form.value.required) {
    options.push({ title: 'Set Null', value: 'setnull' })
  }

  return options
})

watch(() => form.value.required, (required) => {
  if (required && form.value.type === 'relation' && form.value.onDelete === 'setnull') {
    form.value.onDelete = 'restrict'
  }
})

const noValueRules = [
  'email', 'url', 'alphanumeric', 'isInteger',
  'uniqueItems', 'pastOnly', 'futureOnly', 'disableWeekends',
  'validJson', 'isTrue', 'validUuid'
]

const requiresValue = (type: string) => !noValueRules.includes(type)

const rulesByType = computed<Record<string, { title: string; value: string }[]>>(() => ({
  string: [
    { title: 'Minimum Uzunluk', value: 'minLength' },
    { title: 'Maksimum Uzunluk', value: 'maxLength' },
    { title: 'Tam Uzunluk', value: 'exactLength' },
    { title: t('common.emailFormat'), value: 'email' },
    { title: t('common.urlFormat'), value: 'url' },
    { title: t('er.alphanumericOnly'), value: 'alphanumeric' },
    { title: t('common.regularExpressionRegex'), value: 'regex' }
  ],
  password: [
    { title: 'Minimum Uzunluk', value: 'minLength' },
    { title: 'Maksimum Uzunluk', value: 'maxLength' },
    { title: 'Tam Uzunluk', value: 'exactLength' },
    { title: t('common.regularExpressionRegex'), value: 'regex' }
  ],
  number: [
    { title: t('common.minimumValue'), value: 'min' },
    { title: t('common.maximumValue'), value: 'max' },
    { title: t('er.integerOnly'), value: 'isInteger' },
    { title: t('er.stepMultiple'), value: 'step' }
  ],
  array: [
    { title: 'Min Eleman', value: 'minItems' },
    { title: 'Max Eleman', value: 'maxItems' },
    { title: 'Benzersiz Elemanlar', value: 'uniqueItems' }
  ],
  date: [
    { title: 'Min Tarih', value: 'minDate' },
    { title: 'Max Tarih', value: 'maxDate' },
    { title: t('er.pastOnly'), value: 'pastOnly' },
    { title: 'Sadece Gelecek', value: 'futureOnly' },
    { title: 'Hafta Sonu Engelle', value: 'disableWeekends' }
  ],
  datetime: [
    { title: 'Min Tarih', value: 'minDate' },
    { title: 'Max Tarih', value: 'maxDate' },
    { title: t('er.pastOnly'), value: 'pastOnly' },
    { title: 'Sadece Gelecek', value: 'futureOnly' },
    { title: 'Hafta Sonu Engelle', value: 'disableWeekends' }
  ],
  time: [
    { title: 'En Erken Saat', value: 'minTime' },
    { title: t('er.maxTime'), value: 'maxTime' },
    { title: t('er.timeStep'), value: 'timeStep' }
  ],
  json: [
    { title: t('er.validJson'), value: 'validJson' },
    { title: 'Max Derinlik', value: 'maxDepth' },
    { title: 'Gerekli Anahtarlar', value: 'requiredKeys' }
  ],
  boolean: [
    { title: t('er.mandatoryAccept'), value: 'isTrue' }
  ],
  uuid: [
    { title: t('er.validUuid'), value: 'validUuid' },
    { title: 'UUID Versiyonu', value: 'uuidVersion' }
  ]
}))

const availableRules = computed(() => rulesByType.value[form.value.type] || [])

const localizedEntities = computed(() => {
  return props.entities.map(e => ({
    ...e,
    displayName: $localize(e.name) || e.slug
  }))
})

const addRule = () => {
  const defaultRule = availableRules.value[0]
  form.value.rulesList.push({
    type: defaultRule ? defaultRule.value : '',
    value: '',
    message: ''
  })
}

const close = () => {
  dialogOpen.value = false
}

const save = () => {
  if (form.value.type === 'relation' && form.value.required && form.value.onDelete === 'setnull') {
    form.value.onDelete = 'restrict'
  }
  emit('save', { ...form.value }, props.fieldIndex)
  close()
}
</script>
