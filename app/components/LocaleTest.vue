<template>
  <div class="pa-4 bg-red">
    Locale: {{ $vuetify.locale.current }} <br/>
    Text: {{ $vuetify.locale.t('$vuetify.noDataText') }}
  </div>
</template>
