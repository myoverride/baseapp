<template>
    <v-card>
        <!-- Toolbar with title, search, and add button -->
        <v-toolbar flat :color="color" height="76" class="px-2">
            <v-toolbar-title class="text-h6 font-weight-bold">
                <slot name="title">
                    {{ title }}
                </slot>
            </v-toolbar-title>

            <v-spacer />

            <slot name="toolbarActions" />

            <v-tooltip v-if="canBulkDelete" :model-value="!isOnline ? undefined : false" text="Çevrimdışı modda işlem yapılamaz" location="bottom" :disabled="isOnline">
                <template v-slot:activator="{ props }">
                    <span v-bind="props" class="d-inline-block mr-2">
                        <v-btn
                            color="error"
                            variant="tonal"
                            prepend-icon="mdi-delete-sweep"
                            :disabled="!isOnline"
                            @click="deleteSelectedRows"
                        >
                            {{ $t('common.deleteAll') }} ({{ selectedRows.length }})
                        </v-btn>
                    </span>
                </template>
            </v-tooltip>

            <v-btn v-if="!hideRefresh" icon="mdi-refresh" variant="text" :loading="loading" @click="() => loadItems(false)" class="mr-2"
                :title="$t('common.refresh')" />

            <v-text-field v-if="!hideSearch" variant="outlined" density="compact" v-model="search" :placeholder="$t('common.search')"
                prepend-inner-icon="mdi-magnify" hide-details single-line style="max-width: 240px" clearable
                class="mr-2" @update:model-value="debouncedSearch" />

            <v-dialog v-if="!hideFilter" v-model="showAdvancedFilters" max-width="800">
                <template v-slot:activator="{ props }">
                    <v-btn
                        v-bind="props"
                        icon="mdi-filter"
                        variant="text"
                        :color="advancedFilterGroup ? 'primary' : undefined"
                        class="mr-2"
                        :title="$t('common.advancedFilters')"
                    >
                    </v-btn>
                </template>
                <AdvancedFilterBuilder
                    v-model="advancedFilterGroup"
                    :columns="advancedFilterColumns"
                    @close="showAdvancedFilters = false"
                    @apply="applyAdvancedFilters"
                />
            </v-dialog>

            <v-tooltip v-if="canCreate" :model-value="!isOnline ? undefined : false" text="Çevrimdışı modda işlem yapılamaz" location="bottom" :disabled="isOnline">
                <template v-slot:activator="{ props }">
                    <span v-bind="props" class="d-inline-block">
                        <v-btn icon="mdi-plus" variant="text" :disabled="!isOnline" :title="$t('common.add')" @click="$emit('create')"></v-btn>
                    </span>
                </template>
            </v-tooltip>
        </v-toolbar>

        <v-divider />

        <v-data-table-server v-model:items-per-page="itemsPerPage" v-model:page="page" v-model:sort-by="sortBy"
            :headers="tableHeaders" :items="items" :items-length="totalItems" :loading="loading" class="elevation-0"
            :items-per-page-options="itemsPerPageOptions" :items-per-page-text="itemsPerPageText" :mobile="mobile"
            @update:options="loadItems">

            <template v-slot:header.selectRow>
                <div class="d-flex justify-center">
                    <v-checkbox-btn
                        :model-value="allVisibleSelected"
                        :indeterminate="someVisibleSelected"
                        @update:model-value="toggleSelectAllVisible"
                    />
                </div>
            </template>

            <template v-slot:item.selectRow="{ item }">
                <div class="d-flex justify-center">
                    <v-checkbox-btn
                        :model-value="isRowSelected(item)"
                        @click.stop
                        @update:model-value="(checked) => toggleRowSelection(item, !!checked)"
                    />
                </div>
            </template>

            <!-- Actions column (always present) -->
            <template v-slot:item.actions="{ item }">
                <div class="d-flex">
                    <v-spacer />
                    <slot name="rowActions" :item="item" />
                    <template v-if="extraActions">
                        <v-btn v-for="(action, idx) in extraActions" :key="idx" :icon="action.icon"
                            :color="action.color" size="small" variant="text"
                            :title="action.title"
                            :to="typeof action.to === 'function' ? action.to(item) : action.to"
                            @click="action.click ? action.click(item) : null" />
                    </template>
                    <v-tooltip v-if="canEdit" :model-value="!isOnline ? undefined : false" text="Çevrimdışı modda işlem yapılamaz" location="top" :disabled="isOnline">
                        <template v-slot:activator="{ props }">
                            <span v-bind="props" class="d-inline-block">
                                <v-btn icon="mdi-pencil" size="small" variant="text" :disabled="!isOnline"
                                    :aria-label="$t('common.edit')" @click="$emit('edit', item)" />
                            </span>
                        </template>
                    </v-tooltip>
                    <v-tooltip v-if="canDelete" :model-value="!isOnline ? undefined : false" text="Çevrimdışı modda işlem yapılamaz" location="top" :disabled="isOnline">
                        <template v-slot:activator="{ props }">
                            <span v-bind="props" class="d-inline-block">
                                <v-btn icon="mdi-delete" size="small" variant="text" color="error" :disabled="!isOnline"
                                    :aria-label="$t('common.delete')" @click="$emit('delete', item)" />
                            </span>
                        </template>
                    </v-tooltip>
                </div>
            </template>

            <!-- createdAt column (default formatting) -->
            <template v-slot:item.created_at="{ item }">
                {{ formatAppDate(String(item.created_at || item.createdAt || '')) }}
            </template>

            <!-- updatedAt column (default formatting) -->
            <template v-slot:item.updated_at="{ item }">
                {{ formatAppDate(String(item.updated_at || item.updatedAt || '')) }}
            </template>

            <!-- Dynamic slots for all data columns to support localization -->
            <template v-for="col in dataColumns" :key="col.key" v-slot:[`item.${col.key}`]="{ item }">
                <slot :name="`item.${col.key}`" :item="item">
                    <span v-if="Array.isArray(item[col.key])">
                        <v-chip size="small" class="mr-1 mb-1" v-for="(v, i) in item[col.key]" :key="i">{{ $localize(v) }}</v-chip>
                    </span>
                    <span v-else>{{ $localize(item[col.key]) }}</span>
                </slot>
            </template>

            <!-- Loading State Enhancement -->
            <template v-slot:loading>
                <v-skeleton-loader
                    v-if="items.length === 0"
                    type="table-row-divider@5"
                    class="ma-4"
                ></v-skeleton-loader>
                <div v-else class="text-center py-4">
                    <v-progress-linear indeterminate :color="color"></v-progress-linear>
                    <span class="text-caption text-grey mt-2 d-block">{{ $t('common.loading') }}</span>
                </div>
            </template>

            <!-- No Data State Enhancement -->
            <template v-slot:no-data>
                <div class="text-center py-10">
                    <v-icon size="48" color="grey-lighten-1">mdi-database-off</v-icon>
                    <div class="text-grey mt-2">{{ $t('common.noData') }}</div>
                    <v-btn
                        variant="text"
                        :color="color"
                        class="mt-4"
                        prepend-icon="mdi-refresh"
                        @click="() => loadItems(false)"
                    >
                        {{ $t('common.tryAgain') }}
                    </v-btn>
                </div>
            </template>
        </v-data-table-server>
    </v-card>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router'
import AdvancedFilterBuilder from './AdvancedFilterBuilder.vue'
import type { FilterGroup } from '../utils/filterTypes'
const { mobile } = useDisplay()
const { isOnline } = useNetworkStatus()

interface Column {
    key: string
    title: string
    type?: string
    sortable?: boolean
    filterable?: boolean
    align?: 'start' | 'center' | 'end'
    slot?: boolean // Custom slot için
    hideOnMobile?: boolean
    width?: string | number
}

interface Props {
    apiEndpoint: string
    columns: Column[]
    title: string
    resource?: string
    helpTopic?: string
    hideCreate?: boolean
    hideEdit?: boolean
    hideDelete?: boolean
    hideActions?: boolean
    hideSearch?: boolean
    hideFilter?: boolean
    hideRefresh?: boolean
    defaultSortKey?: string
    defaultSortOrder?: 'asc' | 'desc'
    rowKey?: string | ((item: any) => string)
    extraActions?: {
        icon: string
        color?: string
        to?: string | ((item: any) => string)
        click?: (item: any) => void
        title?: string
    }[]
    extraParams?: Record<string, any>
    enableMultiSelect?: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
    create: []
    edit: [item: Record<string, unknown>]
    delete: [item: Record<string, unknown>]
    loaded: [items: any[]]
}>()

const { t, locale } = useI18n();
const { $localize, $toast } = useNuxtApp();
const route = useRoute()

// Fetch system variables properly via Nuxt composable
const { sysVars, primaryColor: color } = useSysVars();

// Advanced Filter State
const showAdvancedFilters = ref(false)
const advancedFilterGroup = ref<FilterGroup | null>(null)

// Initialize from route if exists
if (route.query.advancedFilters) {
    try {
        advancedFilterGroup.value = JSON.parse(route.query.advancedFilters as string)
    } catch (e) {
        console.warn('Invalid advancedFilters in URL')
    }
}

const advancedFilterColumns = computed(() => {
    return props.columns.filter(col => {
        if (col.filterable === false) return false;
        if (col.key.startsWith('_')) return false; // Hide aggregates/relations like _count
        return true;
    })
})

const applyAdvancedFilters = () => {
    showAdvancedFilters.value = false
    page.value = 1
    loadItems()
}

// Visibility based on props (default behavior restored)
const canCreate = computed(() => !props.hideCreate)
const canEdit = computed(() => !props.hideEdit)
const canDelete = computed(() => !props.hideDelete)

const enableMultiSelect = computed(() => props.enableMultiSelect !== false)
const selectedRows = ref<Record<string, unknown>[]>([])
const canBulkDelete = computed(() => canDelete.value && enableMultiSelect.value && selectedRows.value.length > 0)

const getRowKey = (row: any): string => {
    if (props.rowKey) {
        if (typeof props.rowKey === 'function') return String(props.rowKey(row));
        return String(row?.[props.rowKey] ?? '');
    }
    return String(row?.id ?? row?._id ?? row?.device_id ?? '');
}

const isRowSelected = (row: any): boolean => {
    const key = getRowKey(row)
    if (!key) return false
    return selectedRows.value.some((r: any) => getRowKey(r) === key)
}

const allVisibleSelected = computed(() => {
    if (!enableMultiSelect.value || items.value.length === 0) return false
    return items.value.every((row: any) => isRowSelected(row))
})

const someVisibleSelected = computed(() => {
    if (!enableMultiSelect.value || items.value.length === 0) return false
    const selectedCount = items.value.filter((row: any) => isRowSelected(row)).length
    return selectedCount > 0 && selectedCount < items.value.length
})

function toggleRowSelection(row: Record<string, unknown>, checked: boolean) {
    const key = getRowKey(row)
    if (!key) return

    if (checked) {
        if (!selectedRows.value.some((r: any) => getRowKey(r) === key)) {
            selectedRows.value.push(row)
        }
        return
    }

    selectedRows.value = selectedRows.value.filter((r: any) => getRowKey(r) !== key)
}

function toggleSelectAllVisible(checked: boolean) {
    if (!enableMultiSelect.value) return

    if (checked) {
        const merged = [...selectedRows.value]
        for (const row of items.value as any[]) {
            const key = getRowKey(row)
            if (!key) continue
            if (!merged.some((r: any) => getRowKey(r) === key)) {
                merged.push(row)
            }
        }
        selectedRows.value = merged
        return
    }

    const visibleKeys = new Set((items.value as any[]).map((row: any) => getRowKey(row)).filter(Boolean))
    selectedRows.value = selectedRows.value.filter((r: any) => !visibleKeys.has(getRowKey(r)))
}

async function deleteSelectedRows() {
    const rows = [...selectedRows.value]
    if (rows.length === 0) return

    const confirmed = window.confirm(t('crud.confirmDeleteMulti').replace('{0}', String(rows.length)))
    if (!confirmed) return

    const originalConfirm = window.confirm
    window.confirm = () => true
    try {
        for (const row of rows) {
            emit('delete', row)
        }
    } finally {
        window.confirm = originalConfirm
    }

    selectedRows.value = []
}


// LocalStorage keys for this page
const storageKeyItemsPerPage = computed(() => `crudTable_itemsPerPage_${route.path}`)
const storageKeySortBy = computed(() => `crudTable_sortBy_${route.path}`)

// Items per page options
const itemsPerPageOptions = [10, 25, 50, 100, 200]

const itemsPerPageText = computed(() => {
    const code = String(locale.value || 'en').toLowerCase().split(/[-_]/)[0]
    if (code === 'ar') return 'عدد العناصر لكل صفحة:'
    if (code === 'tr') return 'Sayfa başına öğe:'
    return 'Items per page:'
})

// Load initial itemsPerPage from localStorage or default to 10
const getInitialItemsPerPage = (): number => {
    if (import.meta.client) {
        const stored = localStorage.getItem(storageKeyItemsPerPage.value)
        if (stored) {
            const parsed = parseInt(stored, 10)
            if (itemsPerPageOptions.includes(parsed)) {
                return parsed
            }
        }
    }
    return 10
}

// Load initial sortBy from localStorage or use defaultSortKey
const getInitialSortBy = (): { key: string; order: 'asc' | 'desc' }[] => {
    if (import.meta.client) {
        const stored = localStorage.getItem(storageKeySortBy.value)
        if (stored) {
            try {
                const parsed = JSON.parse(stored)
                if (Array.isArray(parsed) && parsed.length > 0) {
                    return parsed
                }
            } catch (e) {
                // Invalid JSON, ignore
            }
        }
    }
    return props.defaultSortKey ? [{ key: props.defaultSortKey, order: props.defaultSortOrder || 'asc' }] : []
}

// Data State
const search = ref((route.query.search || '') as string)
const items = ref<Record<string, unknown>[]>([])
const totalItems = ref(0)
const loading = ref(true)
const page = ref(1)
const itemsPerPage = ref(getInitialItemsPerPage())
const sortBy = ref<{ key: string; order: 'asc' | 'desc' }[]>(getInitialSortBy())
let latestLoadRequestId = 0

// Watch itemsPerPage and save to localStorage
watch(itemsPerPage, (newVal) => {
    if (import.meta.client) {
        localStorage.setItem(storageKeyItemsPerPage.value, String(newVal))
    }
})

// Watch sortBy and save to localStorage
watch(sortBy, (newVal) => {
    if (import.meta.client) {
        localStorage.setItem(storageKeySortBy.value, JSON.stringify(newVal))
    }
}, { deep: true })

// Watch extraParams to reload items
watch(() => props.extraParams, () => {
    page.value = 1
    loadItems()
}, { deep: true })

// Veri sütunlarını bul (created_at ve updated_at hariç)
const dataColumns = computed(() =>
    props.columns.filter(col => col.key !== 'created_at' && col.key !== 'updated_at')
)

// Convert columns to v-data-table headers format
const tableHeaders = computed(() => {
    const headers: any[] = props.columns
        .filter(col => !(mobile.value && col.hideOnMobile))
        .map(col => ({
            title: typeof $localize === 'function' ? $localize(col.title) : col.title,
            key: col.key,
            sortable: col.sortable ?? true,
            align: col.align
        }))

    if (enableMultiSelect.value) {
        headers.unshift({
            title: '',
            key: 'selectRow',
            sortable: false,
            align: 'center' as const,
            width: 52
        })
    }

    // İşlem sütununu ekle (eğer gizlenmemişse)
    if (!props.hideActions) {
        headers.push({
            title: t('common.actions'),
            key: 'actions',
            sortable: false,
            align: 'end' as const
        })
    }

    return headers
})

// Debounced search
let searchTimeout: ReturnType<typeof setTimeout>
function debouncedSearch() {
    clearTimeout(searchTimeout)
    searchTimeout = setTimeout(() => {
        page.value = 1
        loadItems()
    }, 300)
}


let loadItemsTimeout: ReturnType<typeof setTimeout> | null = null

// Load items from API
async function loadItems(silent = false) {
    if (import.meta.server) return // Prevent SSR fetching without cookies

    if (!silent) loading.value = true

    if (loadItemsTimeout) {
        clearTimeout(loadItemsTimeout)
    }

    return new Promise<void>((resolve) => {
        loadItemsTimeout = setTimeout(async () => {
            loadItemsTimeout = null
            const requestId = ++latestLoadRequestId
            
            try {
                const sortKey = sortBy.value[0]?.key || props.defaultSortKey || 'createdAt'
                const sortOrder = sortBy.value[0]?.order || props.defaultSortOrder || 'desc'

                const response = await $fetch<any>(props.apiEndpoint, {
                    params: {
                        page: page.value,
                        limit: itemsPerPage.value,
                        search: search.value || undefined,
                        advancedFilters: advancedFilterGroup.value ? JSON.stringify(advancedFilterGroup.value) : undefined,
                        sortBy: sortKey,
                        sortOrder: sortOrder,
                        ...props.extraParams
                    }
                })

                if (requestId !== latestLoadRequestId) {
                    resolve()
                    return
                }

                items.value = Array.isArray(response) ? response : (response.records || response.data || [])
                totalItems.value = Array.isArray(response) ? response.length : (response.total ?? response.pagination?.total ?? response.meta?.total ?? 0)
                emit('loaded', items.value)
                selectedRows.value = selectedRows.value.filter((selected: any) => {
                    const selectedKey = getRowKey(selected)
                    return selectedKey && items.value.some((item: any) => getRowKey(item) === selectedKey)
                })
            } catch (error: any) {
                if (requestId !== latestLoadRequestId) {
                    resolve()
                    return
                }
                const errorKey = error.data?.message || error.message || 'message.loadError';
                $toast.error(t(errorKey));
            } finally {
                if (requestId === latestLoadRequestId) {
                    loading.value = false
                }
                resolve()
            }
        }, 50)
    })
}

// Expose refresh and query methods
const getCurrentQuery = () => {
    const sortKey = sortBy.value[0]?.key || props.defaultSortKey || 'createdAt'
    const sortOrder = sortBy.value[0]?.order || props.defaultSortOrder || 'desc'
    return {
        search: search.value || undefined,
        advancedFilters: advancedFilterGroup.value ? JSON.stringify(advancedFilterGroup.value) : undefined,
        sortBy: sortKey,
        sortOrder: sortOrder,
        ...props.extraParams
    }
}

defineExpose({ loadItems, getCurrentQuery })

</script>
