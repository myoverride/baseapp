<template>
  <v-container>
    <div class="mb-4">
      <v-btn prepend-icon="mdi-arrow-left" variant="text" to="/admin/devices" class="text-none font-weight-medium px-0 text-body-1" color="grey-darken-2">
        {{ $t('page.devices') }}
      </v-btn>
    </div>
    
    <CrudTable
      v-if="device && columns.length > 0"
      ref="crudTable"
      :enable-multi-select="false"
      :api-endpoint="'/api/admin/telemetry/' + deviceId"
      :columns="columns"
      :title="`${deviceId} Telemetri Verileri`"
      default-sort-key="timestamp"
      default-sort-order="desc"
      :hide-actions="true"
    >
      <template #toolbarActions>      </template>
      <template v-slot:item.payload="{ item }">
        <v-chip size="small" variant="outlined" :color="color" class="font-weight-bold mr-1" v-for="(val, key) in item.payload" :key="key">
          {{ key }}: {{ val }}
        </v-chip>
      </template>
      <template v-slot:item.timestamp="{ item }">
        {{ formatAppDate(item.timestamp as any) }}
      </template>
    </CrudTable>

    <div v-else-if="!device" class="text-center mt-10">
      <v-progress-circular indeterminate :color="color"></v-progress-circular>
      <p class="mt-2 text-grey">{{ $t('message.loadingDevice') }}</p>
    </div>

    <!-- Yardım (Help) Dialogu -->    
  </v-container>
</template>

<script setup lang="ts">
const { primaryColor: color } = useSysVars();
import { ref, computed } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const route = useRoute();
const deviceId = route.params.device_id as string;

useHead({ title: () => `${deviceId} Telemetri` })

const crudTable = ref();
// Sayfa yüklendiğinde şemayı almak için bir kez istek atalım
const { data: initialData } = await useFetch('/api/admin/telemetry/' + deviceId, { params: { limit: 1 }, server: false });

const device = computed(() => (initialData.value as any)?.device || null);

const columns = computed(() => [
  {
    title: 'ID',
    key: 'id',
    sortable: true,
    filterable: true,
    type: 'number',
    width: '80px'
  },
  {
    title: t('table.payload'),
    key: 'payload',
    sortable: false,
    filterable: true,
    type: 'string',
    slot: true
  },
  {
    title: t('table.timestamp'),
    key: 'timestamp',
    sortable: true,
    filterable: true,
    type: 'datetime',
    slot: true,
    width: '180px'
  }
]);

</script>
