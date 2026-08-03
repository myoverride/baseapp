<template>
  <div :id="instanceId" class="dynamic-container">
    <v-alert v-if="loadError" type="error" variant="tonal" icon="mdi-alert" class="ma-4">
      <div class="font-weight-bold">{{ $t('message.componentLoadError') }}</div>
      <div class="text-caption">{{ loadError }}</div>
    </v-alert>

    <div v-else-if="loading || sysVarsStatus === 'pending'" class="d-flex justify-center pa-4 align-center fill-height" style="min-height: 200px;">
      <v-progress-circular indeterminate :color="color" size="64"></v-progress-circular>
    </div>

    <div v-else class="render-area">
      <Suspense>
        <template #default>
          <div style="height: 100%; width: 100%;">
            <component :is="activeComponent" v-bind="$attrs">
              <slot></slot>
            </component>
          </div>
        </template>
        <template #fallback>
          <div class="d-flex justify-center pa-4">
            <v-progress-circular indeterminate :color="color"></v-progress-circular>
          </div>
        </template>
      </Suspense>
    </div>
  </div>
</template>

<script setup lang="ts">
const { primaryColor: color } = useSysVars();
import { 
  ref, reactive, computed, watch, watchEffect, watchPostEffect, watchSyncEffect,
  onMounted, onUnmounted, onUpdated, onBeforeMount, onBeforeUnmount, onErrorCaptured, onActivated, onDeactivated,
  shallowRef, triggerRef, customRef, shallowReactive, shallowReadonly, toRaw, markRaw,
  toRef, toRefs, unref, isRef, isReactive, isReadonly, isProxy,
  provide, inject, nextTick, useSlots, useCssModule, useModel,
  defineComponent, h, useAttrs 
} from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useHead, useSeoMeta, useNuxtApp } from '#imports';
import * as VuetifyComponents from 'vuetify/components';
import { useUtils } from '../composables/useUtils';
import { useI18n } from 'vue-i18n';
import CrudTable from './CrudTable.vue';
import ItemDialog from './ItemDialog.vue';
import RecordsManager from './RecordsManager.vue';
import DynamicComponent from './DynamicComponent.vue';
import AdvancedFilterBuilder from './AdvancedFilterBuilder.vue';

defineOptions({ inheritAttrs: false });

const props = defineProps<{
  templateString?: string;
  scriptContent?: string;
  styleContent?: string;
  routeParams?: Record<string, string>;
  locale?: string;
}>();

const globalI18nObj = useI18n();
const { t } = globalI18nObj;
const nuxtApp = useNuxtApp();
const loading = ref(false);
const activeComponent = shallowRef<any>(null);
const loadError = ref<string | null>(null);
const templateInlineStyle = ref('');

const instanceId = ref(`ds-${Math.random().toString(36).slice(2, 10)}`);

// Fetch system variables globally for all dynamic pages
const { sysVars, status: sysVarsStatus } = useSysVars();

// CSS Scoping
const scopeCss = (css: string, scopeId: string) => {
  if (!css) return '';
  const cleanCss = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return cleanCss.replace(/([^\r\n,{}]+)(?=\s*{)/g, (match) => {
    const selectors = match.split(',');
    return selectors.map(s => {
      const trimmed = s.trim();
      if (!trimmed) return '';
      if (trimmed.startsWith('@') || trimmed.startsWith(':root') || trimmed.match(/^(\d+%|from|to)$/i)) return trimmed;
      return `#${scopeId} ${trimmed}`;
    }).join(', ');
  });
};

const styleToInject = computed(() => {
  const baseStyle = props.styleContent || '';
  const fullStyle = [baseStyle, templateInlineStyle.value].filter(Boolean).join('\n');
  return scopeCss(fullStyle, instanceId.value);
});

let styleNode: HTMLStyleElement | null = null;

const updateStyleNode = (css: string) => {
  if (typeof document === 'undefined') return;
  if (!styleNode) {
    styleNode = document.createElement('style');
    styleNode.id = `dynamic-style-${instanceId.value}`;
    document.head.appendChild(styleNode);
  }
  styleNode.innerHTML = css;
};

watch(styleToInject, (newStyle) => {
  if (newStyle) {
    updateStyleNode(newStyle);
  } else if (styleNode) {
    styleNode.remove();
    styleNode = null;
  }
}, { immediate: true });

onUnmounted(() => {
  if (styleNode && typeof document !== 'undefined') {
    styleNode.remove();
    styleNode = null;
  }
});

const sanitizeTemplate = (rawTemplate: string) => {
  let extractedStyle = '';
  const withoutStyle = rawTemplate.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (_, css: string) => {
    if (css?.trim()) extractedStyle += `\n${css.trim()}\n`;
    return '';
  });

  const sanitized = withoutStyle
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<link[^>]*rel=["']?stylesheet["']?[^>]*>/gi, '');

  return {
    template: sanitized,
    extractedStyle: extractedStyle.trim()
  };
};

let activeCleanup: (() => void) | null = null;

const createComponent = async (template: string, script: string) => {
  if (!template) return null;

  let fetchedMessages = null;
  if (props.locale) {
    const loadedLocales = Object.keys(globalI18nObj.messages.value);
    if (!loadedLocales.includes(props.locale)) {
      try {
        // Fetch the requested language directly into the preview
        fetchedMessages = await $fetch(`/api/i18n/messages?locale=${props.locale}`);
      } catch (e) {
        console.error("Failed to load locale messages for preview:", e);
      }
    }
  }

  // Trackers for garbage collection/cleanup
  const activeIntervals = new Set<any>();
  const activeTimeouts = new Set<any>();
  const activeListeners = new Set<{ target: EventTarget; type: string; listener: any; options?: any }>();
  const activeObservers = new Set<{ disconnect: () => void }>();
  const activeAnimationFrames = new Set<number>();
  const activeAbortControllers = new Set<AbortController>();

  const cleanup = () => {
    for (const id of activeIntervals) {
      window.clearInterval(id);
    }
    activeIntervals.clear();

    for (const id of activeTimeouts) {
      window.clearTimeout(id);
    }
    activeTimeouts.clear();

    for (const item of activeListeners) {
      try {
        item.target.removeEventListener(item.type, item.listener, item.options);
      } catch (e) {}
    }
    activeListeners.clear();

    for (const obs of activeObservers) {
      try {
        obs.disconnect();
      } catch (e) {}
    }
    activeObservers.clear();

    for (const id of activeAnimationFrames) {
      window.cancelAnimationFrame(id);
    }
    activeAnimationFrames.clear();

    for (const controller of activeAbortControllers) {
      try {
        controller.abort();
      } catch (e) {}
    }
    activeAbortControllers.clear();
  };

  try {
    let rawScript = script;
    if (typeof rawScript === 'object' && rawScript !== null) {
      rawScript = JSON.stringify(rawScript);
    }
    const finalScript = rawScript || '';

    // GC-safe wrappers
    const customSetInterval = (handler: TimerHandler, timeout?: number, ...args: any[]) => {
      const id = window.setInterval(handler, timeout, ...args);
      activeIntervals.add(id);
      return id;
    };

    const customSetTimeout = (handler: TimerHandler, timeout?: number, ...args: any[]) => {
      const id = window.setTimeout(() => {
        activeTimeouts.delete(id);
        if (typeof handler === 'function') {
          handler(...args);
        }
      }, timeout, ...args);
      activeTimeouts.add(id);
      return id;
    };

    const customRequestAnimationFrame = (callback: FrameRequestCallback) => {
      const id = window.requestAnimationFrame(callback);
      activeAnimationFrames.add(id);
      return id;
    };

    const customCancelAnimationFrame = (id: number) => {
      activeAnimationFrames.delete(id);
      window.cancelAnimationFrame(id);
    };

    const customClearInterval = (id: any) => {
      activeIntervals.delete(id);
      window.clearInterval(id);
    };

    const customClearTimeout = (id: any) => {
      activeTimeouts.delete(id);
      window.clearTimeout(id);
    };

    const customFetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const controller = new AbortController();
      activeAbortControllers.add(controller);
      
      let signal = controller.signal;
      if (init?.signal) {
        const userSignal = init.signal;
        const linkedController = new AbortController();
        const onAbort = () => linkedController.abort();
        if (userSignal.aborted || controller.signal.aborted) {
          linkedController.abort();
        } else {
          userSignal.addEventListener('abort', onAbort);
          controller.signal.addEventListener('abort', onAbort);
        }
        signal = linkedController.signal;
      }

      const mergedInit = {
        ...init,
        signal
      };

      return window.fetch(input, mergedInit).finally(() => {
        activeAbortControllers.delete(controller);
      });
    };

    const custom$fetch = (request: any, opts?: any) => {
      const controller = new AbortController();
      activeAbortControllers.add(controller);
      
      let signal = controller.signal;
      if (opts?.signal) {
        const userSignal = opts.signal;
        const linkedController = new AbortController();
        const onAbort = () => linkedController.abort();
        if (userSignal.aborted || controller.signal.aborted) {
          linkedController.abort();
        } else {
          userSignal.addEventListener('abort', onAbort);
          controller.signal.addEventListener('abort', onAbort);
        }
        signal = linkedController.signal;
      }

      const mergedOpts = {
        ...opts,
        signal
      };

      return $fetch(request, mergedOpts).finally(() => {
        activeAbortControllers.delete(controller);
      });
    };

    const TrackedResizeObserver = class extends ResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        super(callback);
        activeObservers.add(this);
      }
    };

    const TrackedIntersectionObserver = class extends IntersectionObserver {
      constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        super(callback, options);
        activeObservers.add(this);
      }
    };

    const TrackedMutationObserver = class extends MutationObserver {
      constructor(callback: MutationCallback) {
        super(callback);
        activeObservers.add(this);
      }
    };

    const trackedWindow = new Proxy(window, {
      get(target, prop, receiver) {
        if (prop === 'addEventListener') {
          return (type: string, listener: any, options?: any) => {
            activeListeners.add({ target: window, type, listener, options });
            return window.addEventListener(type, listener, options);
          };
        }
        if (prop === 'removeEventListener') {
          return (type: string, listener: any, options?: any) => {
            for (const item of activeListeners) {
              if (item.target === window && item.type === type && item.listener === listener) {
                activeListeners.delete(item);
                break;
              }
            }
            return window.removeEventListener(type, listener, options);
          };
        }
        if (prop === 'setInterval') return customSetInterval;
        if (prop === 'setTimeout') return customSetTimeout;
        if (prop === 'clearInterval') return customClearInterval;
        if (prop === 'clearTimeout') return customClearTimeout;
        if (prop === 'requestAnimationFrame') return customRequestAnimationFrame;
        if (prop === 'cancelAnimationFrame') return customCancelAnimationFrame;
        if (prop === 'fetch') return customFetch;
        if (prop === '$fetch') return custom$fetch;
        
        const val = Reflect.get(target, prop);
        if (typeof val === 'function') {
          const propStr = String(prop);
          // Constructor / Class check (starts with uppercase)
          if (propStr.length > 0 && propStr.charAt(0) === propStr.charAt(0).toUpperCase()) {
            return val;
          }
          return val.bind(target);
        }
        return val;
      },
      set(target, prop, value) {
        return Reflect.set(target, prop, value, target);
      }
    });

    const trackedDocument = new Proxy(document, {
      get(target, prop, receiver) {
        if (prop === 'addEventListener') {
          return (type: string, listener: any, options?: any) => {
            activeListeners.add({ target: document, type, listener, options });
            return document.addEventListener(type, listener, options);
          };
        }
        if (prop === 'removeEventListener') {
          return (type: string, listener: any, options?: any) => {
            for (const item of activeListeners) {
              if (item.target === document && item.type === type && item.listener === listener) {
                activeListeners.delete(item);
                break;
              }
            }
            return document.removeEventListener(type, listener, options);
          };
        }
        
        const val = Reflect.get(target, prop);
        if (typeof val === 'function') {
          const propStr = String(prop);
          // Constructor / Class check (starts with uppercase)
          if (propStr.length > 0 && propStr.charAt(0) === propStr.charAt(0).toUpperCase()) {
            return val;
          }
          return val.bind(target);
        }
        return val;
      },
      set(target, prop, value) {
        return Reflect.set(target, prop, value, target);
      }
    });

    // Vue Composition API and common Nuxt composables injection
    const customDefineProps = (ignoredDef: any) => useAttrs();
    const customDefineEmits = (ignoredDef: any) => {
      const attrs = useAttrs();
      return (event: string, ...args: any[]) => {
        const camelEvent = event.replace(/-([a-z])/g, (_, p1) => p1 ? p1.toUpperCase() : '');
        const handlerName1 = 'on' + camelEvent.charAt(0).toUpperCase() + camelEvent.slice(1);
        const handlerName2 = 'on' + event.charAt(0).toUpperCase() + event.slice(1);
        
        if (typeof attrs[handlerName1] === 'function') {
          (attrs[handlerName1] as Function)(...args);
        } else if (typeof attrs[handlerName2] === 'function') {
          (attrs[handlerName2] as Function)(...args);
        }
      };
    };

    const vueContext = {
      // Reactivity
      ref, reactive, computed, watch, watchEffect, watchPostEffect, watchSyncEffect,
      shallowRef, triggerRef, customRef, shallowReactive, shallowReadonly, toRaw, markRaw,
      toRef, toRefs, unref, isRef, isReactive, isReadonly, isProxy,
      // Lifecycle & Utilities
      onMounted, onUnmounted, onUpdated, onBeforeMount, onBeforeUnmount, onErrorCaptured, onActivated, onDeactivated,
      provide, inject, nextTick, useSlots, useCssModule, useModel,
      h, defineComponent, useAttrs,
      defineProps: customDefineProps, defineEmits: customDefineEmits,
      useRouter, useRoute,
      useFetch, useAsyncData, useCookie, useState, navigateTo, $fetch: custom$fetch, useSysVars, useUtils, useWS,
      useHead, useSeoMeta, useI18n, useNuxtApp,
      $localize: (nuxtApp as any).$localize,
      $toast: (nuxtApp as any).$toast,
      routeParams: props.routeParams,
      __props_locale: props.locale,
      __global_messages: globalI18nObj.messages.value,
      __fetched_messages: fetchedMessages,
      sysVars: new Proxy({}, {
        get(target, prop) {
          if (!sysVars.value) return undefined;
          return (sysVars.value as Record<string, any>)[prop as string];
        }
      }), // Injected reactive system variables
      // GC-safe wrappers
      window: trackedWindow,
      document: trackedDocument,
      globalThis: trackedWindow,
      setInterval: customSetInterval,
      setTimeout: customSetTimeout,
      clearInterval: customClearInterval,
      clearTimeout: customClearTimeout,
      requestAnimationFrame: customRequestAnimationFrame,
      cancelAnimationFrame: customCancelAnimationFrame,
      fetch: customFetch,
      ResizeObserver: TrackedResizeObserver,
      IntersectionObserver: TrackedIntersectionObserver,
      MutationObserver: TrackedMutationObserver
    };

    const contextKeys = Object.keys(vueContext);
    const contextValues = Object.values(vueContext);

    const moduleCode = `
      export default function(__vueContext) {
        const { ${contextKeys.join(', ')} } = __vueContext;
        const userSetup = function(__props, __ctx) {
          ${finalScript}
        };
        return {
          setup(props, ctx) {
            let localI18n = null;
            const originalUseI18n = __vueContext.useI18n;

            // Ensure local t is available for the template without duplicate local scopes
            if (__vueContext.__props_locale) {
               const combinedMessages = { ...__vueContext.__global_messages };
               if (__vueContext.__fetched_messages) {
                 combinedMessages[__vueContext.__props_locale] = __vueContext.__fetched_messages;
               }

               localI18n = originalUseI18n({
                 useScope: 'local',
                 locale: __vueContext.__props_locale,
                 inheritLocale: false,
                 messages: combinedMessages
               });
               
               // Temporarily override useI18n so userSetup receives the created local scope!
               // (Returning the function directly ensures user calls to useI18n() get the local instance without triggering a second local scope creation)
               __vueContext.useI18n = () => localI18n;
            }

            const setupResult = userSetup(props, ctx) || {};
            
            // Restore original useI18n for safety
            __vueContext.useI18n = originalUseI18n;

            if (localI18n) {
               setupResult.t = localI18n.t;
            }
            
            return setupResult;
          }
        };
      }
    `;
    const blob = new Blob([moduleCode], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    let componentOptions;
    try {
      // @ts-ignore
      const module = await import(/* @vite-ignore */ url);
      componentOptions = module.default(vueContext);
    } finally {
      URL.revokeObjectURL(url);
    }

    if (!componentOptions || typeof componentOptions !== 'object') {
      throw new Error(t('message.scriptMustBeObject'));
    }

    const component = markRaw(defineComponent({
      ...componentOptions,
      components: {
        ...VuetifyComponents,
        CrudTable,
        ItemDialog,
        RecordsManager,
        DynamicComponent,
        AdvancedFilterBuilder,
        ...(componentOptions.components || {})
      },
      template: vueContext.__props_locale ? template.replace(/\$t\s*\(/g, 't(') : template
    }));

    return { component, cleanup };
  } catch (e: any) {
    let extractedError = e.message;
    if (e.stack) {
      const match = e.stack.match(/<anonymous>:(\d+):(\d+)/);
      if (match) {
        extractedError = `${t('message.syntaxError')} ${t('message.line')} ${match[1]}, ${t('message.column')} ${match[2]}: ${e.message}`;
      }
    }
    
    console.error("DynamicRenderer createComponent Error:", e);
    loadError.value = `${t('message.syntaxError')} ${extractedError}`;
    return null;
  }
};



watch(() => [props.templateString, props.scriptContent, props.locale], async () => {
  loading.value = true;
  loadError.value = null;

  if (activeCleanup) {
    activeCleanup();
    activeCleanup = null;
  }

  if (!props.templateString) {
    loading.value = false;
    return;
  }

  const normalized = sanitizeTemplate(props.templateString || '');
  templateInlineStyle.value = normalized.extractedStyle;

  const result = await createComponent(normalized.template || '', props.scriptContent || '');

  if (result) {
    activeComponent.value = result.component;
    activeCleanup = result.cleanup;
  }
  loading.value = false;
}, { immediate: true });

onUnmounted(() => {
  if (activeCleanup) {
    activeCleanup();
    activeCleanup = null;
  }
});


onErrorCaptured((err: any) => {
  console.error("DynamicRenderer Caught Error:", err);
  loadError.value = err.message || String(err);
  loading.value = false;
  return false;
});
</script>

<style scoped>
.dynamic-container {
  width: 100%;
  position: relative;
  height: 100%;
}
.render-area {
  width: 100%;
  height: 100%;
}
</style>
