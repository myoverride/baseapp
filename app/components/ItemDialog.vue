<template>
    <v-dialog v-model="dialogOpen" :max-width="fullscreen ? undefined : (maxWidth || 480)" :fullscreen="fullscreen" transition="dialog-bottom-transition">
        <v-form ref="formRef" v-model="formValid" @submit.prevent="save" class="fill-height">
            <v-card class="fill-height d-flex flex-column">
                <v-toolbar :color="color" height="76" class="px-2 flex-grow-0">
                    <v-toolbar-title class="text-h6 font-weight-bold">
                        {{ title || (mode === 'create' ? $t('common.add') : $t('common.edit')) }}
                    </v-toolbar-title>
                    <v-spacer></v-spacer>
                    <v-btn v-if="fullscreen" icon="mdi-close" variant="text" size="small" @click="close"></v-btn>
                </v-toolbar>

                <v-card-text class="pa-4 flex-grow-1 d-flex flex-column" style="overflow-y: auto;">
                    <slot :form-data="formData" :mode="mode" />
                </v-card-text>

                <v-divider />

                <v-card-actions class="pa-3">
                    <v-spacer />
                    <v-btn @click="close" :aria-label="$t('common.cancel')">
                        {{ $t('common.cancel') }}
                    </v-btn>
                    <v-btn :color="color" type="submit" :loading="saving" :disabled="!formValid"
                        :aria-label="$t('common.save')">
                        {{ $t('common.save') }}
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-form>
    </v-dialog>
</template>

<script setup lang="ts">
interface Props {
    modelValue: boolean
    title?: string
    mode: 'create' | 'edit'
    initialData?: Record<string, any>
    fullscreen?: boolean
    maxWidth?: number | string
}

const props = withDefaults(defineProps<Props>(), {
    initialData: () => ({})
})

const emit = defineEmits<{
    'update:modelValue': [value: boolean]
    save: [data: Record<string, any>]
}>()

const formRef = ref()
const formValid = ref(false)
const saving = ref(false)
const formData = ref<Record<string, any>>({})

const { primaryColor: color } = useGlobals();

const dialogOpen = computed({
    get: () => props.modelValue,
    set: (val) => emit('update:modelValue', val)
})

// Initialize form data when dialog opens
watch(() => props.modelValue, (open) => {
    if (open) {
        formData.value = { ...props.initialData }
    }
})

function close() {
    dialogOpen.value = false
}

async function save() {
    if (!formRef.value) return

    const { valid } = await formRef.value.validate()
    if (!valid) return

    saving.value = true
    try {
        emit('save', { ...formData.value })
    } finally {
        saving.value = false
    }
}

defineExpose({ close, formData, save })
</script>
