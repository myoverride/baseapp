<template>
  <v-app>
    <v-main class="error-page-wrapper d-flex align-center justify-center position-relative">
      <!-- Animated Background elements -->
      <div class="blob blob-1"></div>
      <div class="blob blob-2"></div>
      <div class="blob blob-3"></div>

      <!-- Main Glassmorphic Card -->
      <v-card class="error-card pa-8 pa-md-12 text-center" max-width="600" width="90%">
        <div class="error-code-bg text-h1 font-weight-black">{{ error?.statusCode || 500 }}</div>
        
        <v-icon size="80" :color="error?.statusCode === 404 ? 'warning' : 'error'" class="mb-6 pulse-animation">
          {{ error?.statusCode === 404 ? 'mdi-map-marker-question-outline' : 'mdi-alert-octagon-outline' }}
        </v-icon>
        
        <h1 class="text-h4 font-weight-bold mb-3 text-medium-emphasis">
          {{ error?.statusCode === 404 ? translate('error.notFound') : translate('error.operationFailed') }}
        </h1>
        
        <!-- Translated Error Message -->
        <p class="text-h6 text-medium-emphasis mb-6 font-weight-regular">
          {{ translate(error?.message || 'error.operationFailed') }}
        </p>

        <!-- Error Details (if data exists) -->
        <v-expand-transition>
          <div v-if="error?.data" class="text-left bg-background pa-4 rounded-lg mb-8 error-details">
            <div v-if="error.data.msg" class="text-body-2 font-weight-bold text-error mb-2">
              {{ error.data.msg }}
            </div>
            <div class="text-caption text-medium-emphasis font-family-monospace">
              <pre style="white-space: pre-wrap;">{{ error.data }}</pre>
            </div>
          </div>
        </v-expand-transition>
        
        <v-btn 
          :color="color || 'primary'" 
          size="x-large" 
          rounded="pill" 
          class="px-8 text-none font-weight-bold" 
          elevation="0" 
          prepend-icon="mdi-home" 
          @click="handleError"
        >
          {{ translate('action.backToSystemPanel') || 'Anasayfaya Dön' }}
        </v-btn>
      </v-card>
    </v-main>
  </v-app>
</template>

<script setup lang="ts">
import { clearError } from '#imports'
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  error: Object as () => any
})

// Graceful fallback for globals and i18n just in case error happens before plugins load
let color = ref('primary');
let translate = (key: string) => key;

try {
  const { t } = useI18n();
  if (t) translate = t;
} catch (e) {
  // i18n not ready
}

try {
  const { primaryColor } = useGlobals();
  if (primaryColor.value) color.value = primaryColor.value;
} catch (e) {
  // globals not ready
}

const handleError = () => clearError({ redirect: '/' })
</script>

<style scoped>
.error-page-wrapper {
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
  overflow: hidden;
  min-height: 100vh;
}

.blob {
  position: absolute;
  filter: blur(80px);
  z-index: 0;
  opacity: 0.6;
  border-radius: 50%;
  animation: float 10s infinite ease-in-out alternate;
}

.blob-1 {
  width: 300px;
  height: 300px;
  background: #ff9a9e;
  top: -100px;
  left: -100px;
  animation-delay: 0s;
}

.blob-2 {
  width: 400px;
  height: 400px;
  background: #fecfef;
  bottom: -150px;
  right: -100px;
  animation-delay: -2s;
}

.blob-3 {
  width: 250px;
  height: 250px;
  background: #a1c4fd;
  top: 40%;
  left: 60%;
  animation-delay: -4s;
}

.error-card {
  position: relative;
  z-index: 1;
  background: rgba(255, 255, 255, 0.7) !important;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.4) !important;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.15) !important;
  border-radius: 24px !important;
  overflow: hidden;
}

.error-code-bg {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 180px !important;
  color: rgba(0, 0, 0, 0.03);
  z-index: -1;
  user-select: none;
  line-height: 1;
}

.pulse-animation {
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% { transform: scale(1); }
  50% { transform: scale(1.1); }
  100% { transform: scale(1); }
}

@keyframes float {
  0% { transform: translate(0, 0) rotate(0deg); }
  100% { transform: translate(30px, 50px) rotate(10deg); }
}

.error-details {
  border-left: 4px solid #f44336;
  max-height: 200px;
  overflow-y: auto;
}

.font-family-monospace {
  font-family: monospace;
  word-break: break-all;
}
</style>
