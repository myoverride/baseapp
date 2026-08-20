const MiniMonaco = {
      name: 'MiniMonaco',
      props: ['modelValue', 'language', 'readOnly'],
      emits: ['update:modelValue'],
      template: `<div ref="container" style="width: 100%; height: 100%;"></div>`,
      setup(props, { emit }) {
        const container = ref(null);
        let editor = null;
        
        onMounted(() => {
          import('https://esm.sh/@monaco-editor/loader').then(module => {
            const loader = module.default;
            loader.init().then(monaco => {
              editor = monaco.editor.create(container.value, {
                value: props.modelValue,
                language: props.language || 'javascript',
                theme: 'vs-dark',
                readOnly: props.readOnly || false,
                minimap: { enabled: false },
                automaticLayout: true
              });
              editor.onDidChangeModelContent(() => {
                emit('update:modelValue', editor.getValue());
              });
              
              watch(() => props.modelValue, (newVal) => {
                if (editor && newVal !== editor.getValue()) {
                  editor.setValue(newVal);
                }
              });
            });
          }).catch(err => {
             console.error("Monaco load error", err);
             container.value.innerHTML = `<textarea style="width:100%;height:100%;background:#1e1e1e;color:#fff;" oninput="this.dispatchEvent(new CustomEvent('update', {detail: this.value}))">${props.modelValue}</textarea>`;
             container.value.firstChild.addEventListener('update', (e) => emit('update:modelValue', e.detail));
          });
        });
        
        return { container };
      }
    };
const CanvasNode = {
      name: 'CanvasNode',
      beforeCreate() {
        // HACK: Inherit all components (like Vuetify's VBtn) from DynamicRenderer (parent)
        let parent = this.$parent;
        while(parent && !parent.$options.components?.VBtn) {
           parent = parent.$parent;
        }
        if (parent && parent.$options.components) {
            this.$options.components = this.$options.components || {}; Object.assign(this.$options.components, parent.$options.components);
        }
      },
      props: ['node', 'selectedId'],
      emits: ['select', 'remove', 'drop-on-node'],
      template: `
        <div 
          class="position-relative transition-swing"
          :class="[
            selectedId === node.id ? 'border-primary border-opacity-100 bg-blue-lighten-5' : '',
            {'pa-2 border border-dashed border-grey': ['v-container','v-row','v-col','div'].includes(node.type) && (!node.children || node.children.length===0)}
          ]"
          :style="selectedId === node.id ? 'outline: 2px solid #3f51b5; outline-offset: -2px;' : ''"
          @click.stop="$emit('select', node)"
          @dragover.prevent="onDragOver"
          @drop.stop="onDrop($event)"
        >
          <!-- THE ACTUAL VUE COMPONENT RENDERED DYNAMICALLY (LIVE PREVIEW) -->
          <component 
            :is="resolvedType" 
            v-bind="computedProps"
            v-on="computedEvents"
            style="min-height: 20px;"
          >
            <template v-if="node.text">{{ node.text }}</template>
            <template v-if="node.children && node.children.length > 0">
                <CanvasNode 
                  v-for="child in node.children" 
                  :key="child.id" 
                  :node="child" 
                  :selected-id="selectedId"
                  @select="$emit('select', $event)"
                  @remove="$emit('remove', $event)"
                  @drop-on-node="$emit('drop-on-node', $event)"
                />
            </template>
          </component>

          <!-- Label overlay for empty containers -->
          <div v-if="['v-container','v-row','v-col','div'].includes(node.type) && (!node.children || node.children.length === 0)" class="text-caption text-grey text-center">
            &lt;{{ node.type }}&gt; (Boş Alan - Sürükleyin)
          </div>

          <v-btn 
            v-if="selectedId === node.id" 
            icon="mdi-delete" 
            color="error" 
            size="x-small" 
            class="position-absolute"
            style="top: -12px; right: -12px; z-index: 100;"
            @click.stop="$emit('remove', node.id)"
          ></v-btn>
        </div>
      `,
      setup(props, { emit }) {
        // Resolve Vue 3 component names dynamically (v-btn -> VBtn) so it can find VuetifyComponents inside DynamicRenderer
        const resolvedType = computed(() => {
            const tag = props.node.type;
            if(!tag.startsWith('v-')) return tag;
            return tag.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
        });

        const computedProps = computed(() => {
            const p = {};
            if(props.node.props) {
                props.node.props.forEach(prop => {
                    if(prop.name) {
                        let val = prop.value;
                        if(val === 'true') val = true;
                        if(val === 'false') val = false;
                        p[prop.name] = val;
                    }
                });
            }
            return p;
        });

        const computedEvents = computed(() => {
            const e = {};
            if(props.node.events) {
                props.node.events.forEach(evt => {
                    if(evt.name) {
                        e[evt.name] = () => { console.log('Simulated Event:', evt.name, 'Action:', evt.action); };
                    }
                });
            }
            return e;
        });

        const onDragOver = (e) => { e.dataTransfer.dropEffect = 'copy'; };
        const onDrop = (e) => {
            try {
                const dataStr = e.dataTransfer.getData('application/json');
                if(dataStr) {
                    emit('drop-on-node', { parentId: props.node.id, data: JSON.parse(dataStr) });
                }
            } catch(err) {}
        };
        return { onDragOver, onDrop, computedProps, computedEvents, resolvedType };
      };

    const viewMode = ref('design');
    const pageSlug = ref('/yeni-uygulama');
    const publishing = ref(false);
    const searchComponent = ref('');
    const canvasComponents = ref([]);
    const selectedId = ref(null);
    
    const AVAILABLE_COMPONENTS = [{"type": "v-alert", "label": "Alert", "icon": "mdi-alert-outline"}, {"type": "v-app", "label": "App", "icon": "mdi-vuetify"}, {"type": "v-app-bar", "label": "App-bar", "icon": "mdi-vuetify"}, {"type": "v-autocomplete", "label": "Autocomplete", "icon": "mdi-vuetify"}, {"type": "v-avatar", "label": "Avatar", "icon": "mdi-vuetify"}, {"type": "v-badge", "label": "Badge", "icon": "mdi-vuetify"}, {"type": "v-banner", "label": "Banner", "icon": "mdi-vuetify"}, {"type": "v-bottom-navigation", "label": "Bottom-navigation", "icon": "mdi-vuetify"}, {"type": "v-bottom-sheet", "label": "Bottom-sheet", "icon": "mdi-vuetify"}, {"type": "v-breadcrumbs", "label": "Breadcrumbs", "icon": "mdi-vuetify"}, {"type": "v-btn-group", "label": "Btn-group", "icon": "mdi-vuetify"}, {"type": "v-btn-toggle", "label": "Btn-toggle", "icon": "mdi-vuetify"}, {"type": "v-btn", "label": "Button", "icon": "mdi-gesture-tap-button"}, {"type": "v-calendar", "label": "Calendar", "icon": "mdi-vuetify"}, {"type": "v-card", "label": "Card", "icon": "mdi-card-outline"}, {"type": "v-carousel", "label": "Carousel", "icon": "mdi-vuetify"}, {"type": "v-checkbox", "label": "Checkbox", "icon": "mdi-checkbox-marked"}, {"type": "v-chip", "label": "Chip", "icon": "mdi-label-outline"}, {"type": "v-chip-group", "label": "Chip-group", "icon": "mdi-vuetify"}, {"type": "v-code", "label": "Code", "icon": "mdi-vuetify"}, {"type": "v-col", "label": "Col", "icon": "mdi-table-column"}, {"type": "v-color-input", "label": "Color-input", "icon": "mdi-vuetify"}, {"type": "v-color-picker", "label": "Color-picker", "icon": "mdi-vuetify"}, {"type": "v-combobox", "label": "Combobox", "icon": "mdi-vuetify"}, {"type": "v-confirm-edit", "label": "Confirm-edit", "icon": "mdi-vuetify"}, {"type": "v-container", "label": "Container", "icon": "mdi-border-outside"}, {"type": "v-counter", "label": "Counter", "icon": "mdi-vuetify"}, {"type": "v-data-iterator", "label": "Data-iterator", "icon": "mdi-vuetify"}, {"type": "v-data-table", "label": "Data-table", "icon": "mdi-vuetify"}, {"type": "v-date-input", "label": "Date-input", "icon": "mdi-vuetify"}, {"type": "v-date-picker", "label": "Date-picker", "icon": "mdi-vuetify"}, {"type": "v-defaults-provider", "label": "Defaults-provider", "icon": "mdi-vuetify"}, {"type": "v-dialog", "label": "Dialog", "icon": "mdi-vuetify"}, {"type": "v-divider", "label": "Divider", "icon": "mdi-minus"}, {"type": "v-empty-state", "label": "Empty-state", "icon": "mdi-vuetify"}, {"type": "v-expansion-panel", "label": "Expansion-panel", "icon": "mdi-vuetify"}, {"type": "v-fab", "label": "Fab", "icon": "mdi-vuetify"}, {"type": "v-field", "label": "Field", "icon": "mdi-vuetify"}, {"type": "v-file-input", "label": "File-input", "icon": "mdi-vuetify"}, {"type": "v-file-upload", "label": "File-upload", "icon": "mdi-vuetify"}, {"type": "v-footer", "label": "Footer", "icon": "mdi-vuetify"}, {"type": "v-form", "label": "Form", "icon": "mdi-vuetify"}, {"type": "v-grid", "label": "Grid", "icon": "mdi-vuetify"}, {"type": "div", "label": "HTML Div", "icon": "mdi-code-tags"}, {"type": "v-hotkey", "label": "Hotkey", "icon": "mdi-vuetify"}, {"type": "v-hover", "label": "Hover", "icon": "mdi-vuetify"}, {"type": "v-icon", "label": "Icon", "icon": "mdi-emoticon-outline"}, {"type": "v-icon-btn", "label": "Icon-btn", "icon": "mdi-vuetify"}, {"type": "v-img", "label": "Image", "icon": "mdi-image-outline"}, {"type": "v-infinite-scroll", "label": "Infinite-scroll", "icon": "mdi-vuetify"}, {"type": "v-input", "label": "Input", "icon": "mdi-vuetify"}, {"type": "v-item-group", "label": "Item-group", "icon": "mdi-vuetify"}, {"type": "v-kbd", "label": "Kbd", "icon": "mdi-vuetify"}, {"type": "v-label", "label": "Label", "icon": "mdi-vuetify"}, {"type": "v-layout", "label": "Layout", "icon": "mdi-vuetify"}, {"type": "v-lazy", "label": "Lazy", "icon": "mdi-vuetify"}, {"type": "v-list", "label": "List", "icon": "mdi-vuetify"}, {"type": "v-locale-provider", "label": "Locale-provider", "icon": "mdi-vuetify"}, {"type": "v-main", "label": "Main", "icon": "mdi-vuetify"}, {"type": "v-menu", "label": "Menu", "icon": "mdi-vuetify"}, {"type": "v-messages", "label": "Messages", "icon": "mdi-vuetify"}, {"type": "v-navigation-drawer", "label": "Navigation-drawer", "icon": "mdi-vuetify"}, {"type": "v-no-ssr", "label": "No-ssr", "icon": "mdi-vuetify"}, {"type": "v-number-input", "label": "Number-input", "icon": "mdi-vuetify"}, {"type": "v-otp-input", "label": "Otp-input", "icon": "mdi-vuetify"}, {"type": "v-overlay", "label": "Overlay", "icon": "mdi-vuetify"}, {"type": "v-pagination", "label": "Pagination", "icon": "mdi-vuetify"}, {"type": "v-parallax", "label": "Parallax", "icon": "mdi-vuetify"}, {"type": "v-picker", "label": "Picker", "icon": "mdi-vuetify"}, {"type": "v-progress-circular", "label": "Progress-circular", "icon": "mdi-vuetify"}, {"type": "v-progress-linear", "label": "Progress-linear", "icon": "mdi-vuetify"}, {"type": "v-pull-to-refresh", "label": "Pull-to-refresh", "icon": "mdi-vuetify"}, {"type": "v-radio", "label": "Radio", "icon": "mdi-vuetify"}, {"type": "v-radio-group", "label": "Radio-group", "icon": "mdi-vuetify"}, {"type": "v-range-slider", "label": "Range-slider", "icon": "mdi-vuetify"}, {"type": "v-rating", "label": "Rating", "icon": "mdi-vuetify"}, {"type": "v-responsive", "label": "Responsive", "icon": "mdi-vuetify"}, {"type": "v-row", "label": "Row", "icon": "mdi-table-row"}, {"type": "v-select", "label": "Select", "icon": "mdi-form-dropdown"}, {"type": "v-selection-control", "label": "Selection-control", "icon": "mdi-vuetify"}, {"type": "v-selection-control-group", "label": "Selection-control-group", "icon": "mdi-vuetify"}, {"type": "v-sheet", "label": "Sheet", "icon": "mdi-vuetify"}, {"type": "v-skeleton-loader", "label": "Skeleton-loader", "icon": "mdi-vuetify"}, {"type": "v-slide-group", "label": "Slide-group", "icon": "mdi-vuetify"}, {"type": "v-slider", "label": "Slider", "icon": "mdi-vuetify"}, {"type": "v-snackbar", "label": "Snackbar", "icon": "mdi-vuetify"}, {"type": "v-snackbar-queue", "label": "Snackbar-queue", "icon": "mdi-vuetify"}, {"type": "v-sparkline", "label": "Sparkline", "icon": "mdi-vuetify"}, {"type": "v-speed-dial", "label": "Speed-dial", "icon": "mdi-vuetify"}, {"type": "v-stepper", "label": "Stepper", "icon": "mdi-vuetify"}, {"type": "v-stepper-vertical", "label": "Stepper-vertical", "icon": "mdi-vuetify"}, {"type": "v-switch", "label": "Switch", "icon": "mdi-toggle-switch"}, {"type": "v-system-bar", "label": "System-bar", "icon": "mdi-vuetify"}, {"type": "v-table", "label": "Table", "icon": "mdi-vuetify"}, {"type": "v-tabs", "label": "Tabs", "icon": "mdi-vuetify"}, {"type": "v-text-field", "label": "Text Field", "icon": "mdi-form-textbox"}, {"type": "v-textarea", "label": "Textarea", "icon": "mdi-vuetify"}, {"type": "v-theme-provider", "label": "Theme-provider", "icon": "mdi-vuetify"}, {"type": "v-time-picker", "label": "Time-picker", "icon": "mdi-vuetify"}, {"type": "v-timeline", "label": "Timeline", "icon": "mdi-vuetify"}, {"type": "v-toolbar", "label": "Toolbar", "icon": "mdi-vuetify"}, {"type": "v-tooltip", "label": "Tooltip", "icon": "mdi-vuetify"}, {"type": "v-treeview", "label": "Treeview", "icon": "mdi-vuetify"}, {"type": "v-validation", "label": "Validation", "icon": "mdi-vuetify"}, {"type": "v-virtual-scroll", "label": "Virtual-scroll", "icon": "mdi-vuetify"}, {"type": "v-window", "label": "Window", "icon": "mdi-vuetify"}];
    const COMPONENT_META = {"v-alert": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-app": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-app-bar": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-autocomplete": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-avatar": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-badge": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-banner": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-bottom-navigation": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-bottom-sheet": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-breadcrumbs": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-btn": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-btn-group": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-btn-toggle": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-calendar": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-card": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-carousel": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-checkbox": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-chip": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-chip-group": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-code": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-color-input": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-color-picker": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-combobox": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-confirm-edit": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-counter": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-data-iterator": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-data-table": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-date-input": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-date-picker": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-defaults-provider": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-dialog": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-divider": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-empty-state": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-expansion-panel": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-fab": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-field": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-file-input": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-file-upload": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-footer": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-form": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-grid": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-hotkey": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-hover": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-icon": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-icon-btn": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-img": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-infinite-scroll": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-input": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-item-group": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-kbd": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-label": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-layout": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-lazy": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-list": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-locale-provider": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-main": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-menu": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-messages": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-navigation-drawer": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-no-ssr": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-number-input": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-otp-input": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-overlay": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-pagination": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-parallax": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-picker": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-progress-circular": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-progress-linear": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-pull-to-refresh": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-radio": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-radio-group": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-range-slider": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-rating": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-responsive": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-select": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-selection-control": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-selection-control-group": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-sheet": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-skeleton-loader": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-slide-group": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-slider": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-snackbar": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-snackbar-queue": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-sparkline": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-speed-dial": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-stepper": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-stepper-vertical": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-switch": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-system-bar": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-table": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-tabs": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-textarea": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-text-field": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-theme-provider": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-timeline": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-time-picker": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-toolbar": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-tooltip": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-treeview": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-validation": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-virtual-scroll": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "v-window": {"props": ["class", "style", "color", "variant", "size", "disabled", "loading", "elevation", "width", "height"], "events": ["click", "change", "input", "update:modelValue"]}, "div": {"props": ["class", "style", "id"], "events": ["click", "mouseover"]}, "span": {"props": ["class", "style", "id"], "events": ["click", "mouseover"]}, "p": {"props": ["class", "style", "id"], "events": ["click"]}, "h1": {"props": ["class", "style", "id"], "events": ["click"]}};

    const filteredComponents = computed(() => {
        if(!searchComponent.value) return AVAILABLE_COMPONENTS;
        const s = searchComponent.value.toLowerCase();
        return AVAILABLE_COMPONENTS.filter(c => c.label.toLowerCase().includes(s) || c.type.toLowerCase().includes(s));
    });

    const getAvailableProps = (compType) => {
        return COMPONENT_META[compType]?.props || ["class", "style", "color", "variant", "disabled"];
    };
    const getAvailableEvents = (compType) => {
        return COMPONENT_META[compType]?.events || ["click", "change", "input", "update:modelValue"];
    };

    const onDragStart = (e, element) => {
        e.dataTransfer.setData('application/json', JSON.stringify(element));
        e.dataTransfer.dropEffect = 'copy';
    };

    const onDragOver = (e) => { e.dataTransfer.dropEffect = 'copy'; };

    const createNode = (original) => {
        return {
            id: 'node_' + Math.random().toString(36).substr(2, 9),
            type: original.type,
            text: '',
            props: [],
            events: [],
            children: []
        };
    };

    const onDrop = (e, targetParentId) => {
        try {
            const dataStr = e.dataTransfer.getData('application/json');
            if(!dataStr) return;
            const original = JSON.parse(dataStr);
            const cloned = createNode(original);
            
            if (targetParentId === null) {
                canvasComponents.value.push(cloned);
            }
            selectedId.value = cloned.id;
        } catch(err) {}
    };

    const handleDropOnNode = (payload) => {
        const { parentId, data } = payload;
        const cloned = createNode(data);
        
        const appendToParent = (nodes) => {
            for(let node of nodes) {
                if(node.id === parentId) {
                    if(!node.children) node.children = [];
                    node.children.push(cloned);
                    return true;
                }
                if(node.children && appendToParent(node.children)) return true;
            }
            return false;
        };
        
        appendToParent(canvasComponents.value);
        selectedId.value = cloned.id;
    };

    const findNode = (nodes, id) => {
        for(let node of nodes) {
            if(node.id === id) return node;
            if(node.children) {
                const found = findNode(node.children, id);
                if(found) return found;
            }
        }
        return null;
    };

    const selectComponent = (node) => {
        selectedId.value = node ? node.id : null;
    };

    const selectedComponent = computed(() => {
        if(!selectedId.value) return null;
        return findNode(canvasComponents.value, selectedId.value);
    });

    const removeNodeRecursive = (nodes, id) => {
        for(let i=0; i<nodes.length; i++) {
            if(nodes[i].id === id) {
                nodes.splice(i, 1);
                return true;
            }
            if(nodes[i].children && removeNodeRecursive(nodes[i].children, id)) return true;
        }
        return false;
    };

    const removeComponent = (id) => {
        removeNodeRecursive(canvasComponents.value, id);
        if(selectedId.value === id) selectedId.value = null;
    };

    const addProp = () => {
        if(selectedComponent.value) {
            if(!selectedComponent.value.props) selectedComponent.value.props = [];
            selectedComponent.value.props.push({ name: '', value: '' });
        }
    };
    const removeProp = (idx) => {
        if(selectedComponent.value) selectedComponent.value.props.splice(idx, 1);
    };

    const addEvent = () => {
        if(selectedComponent.value) {
            if(!selectedComponent.value.events) selectedComponent.value.events = [];
            selectedComponent.value.events.push({ name: 'click', action: 'console.log("Tıklandı!");' });
        }
    };
    const removeEvent = (idx) => {
        if(selectedComponent.value) selectedComponent.value.events.splice(idx, 1);
    };

    const generateCodeRecursive = (nodes, indentLevel = 0) => {
        let html = '';
        const indent = '  '.repeat(indentLevel);
        
        for(let node of nodes) {
            let propsStr = '';
            if(node.props) {
                node.props.forEach(p => {
                    if(p.name) propsStr += ` ${p.name}="${p.value}"`;
                });
            }
            if(node.events) {
                node.events.forEach(e => {
                    if(e.name) propsStr += ` @${e.name}="${node.id}_${e.name}_handler"`;
                });
            }

            html += `${indent}<${node.type}${propsStr}>\n`;
            
            if(node.text) html += `${indent}  ${node.text}\n`;
            
            if(node.children && node.children.length > 0) {
                html += generateCodeRecursive(node.children, indentLevel + 1);
            }
            
            html += `${indent}</${node.type}>\n`;
        }
        return html;
    };

    const generateSetupScriptRecursive = (nodes) => {
        let scriptFuncs = '';
        const traverse = (ns) => {
            for(let n of ns) {
                if(n.events) {
                    n.events.forEach(e => {
                        if(e.name && e.action) {
                            scriptFuncs += `    const ${n.id}_${e.name}_handler = async ($event) => {\n`;
                            scriptFuncs += e.action.split('\n').map(line => `      ${line}`).join('\n') + '\n';
                            scriptFuncs += `    };\n\n`;
                        }
                    });
                }
                if(n.children) traverse(n.children);
            }
        };
        traverse(nodes);
        return scriptFuncs;
    };

    const generatedCode = computed({
        get() {
        let html = '<template>\n';
        html += generateCodeRecursive(canvasComponents.value, 1);
        html += '</template>\n\n<script setup>\n';
        html += 'import { ref, computed, onMounted } from "vue";\n\n';
        html += generateSetupScriptRecursive(canvasComponents.value);
        html += '</script>';
        return html;
        },
        set(newVal) {
            try {
                const parser = new DOMParser();
                const doc = parser.parseFromString(newVal, 'text/html');
                const template = doc.querySelector('template');
                if(!template) return;
                const scriptMatch = newVal.match(/<script setup>([\s\S]*?)<\/script>/);
                const scriptContent = scriptMatch ? scriptMatch[1] : '';
                const eventMap = {};
                const regex = /const (node_[a-z0-9]+)_([a-zA-Z0-9_-]+)_handler = async \(\$event\) => \{([\s\S]*?)\n    \};/g;
                let match;
                while ((match = regex.exec(scriptContent)) !== null) {
                    const nodeId = match[1];
                    const eventName = match[2];
                    const action = match[3].split('\n').map(l => l.replace(/^      /, '')).join('\n').trim();
                    if(!eventMap[nodeId]) eventMap[nodeId] = {};
                    eventMap[nodeId][eventName] = action;
                }
                const parseNode = (element) => {
                    if(element.nodeType === 3) {
                        const text = element.textContent.trim();
                        return text ? text : null;
                    }
                    if(element.nodeType !== 1) return null;
                    let tag = element.tagName.toLowerCase();
                    const node = { id: element.id && element.id.startsWith('node_') ? element.id : 'node_' + Math.random().toString(36).substr(2, 9), type: tag, props: [], events: [], children: [], text: '' };
                    for(let attr of element.attributes) {
                        if(attr.name === 'id') continue;
                        if(attr.name.startsWith('@')) {
                            const evtName = attr.name.substring(1);
                            const handlerName = attr.value;
                            let action = '';
                            if(handlerName.includes('_handler')) {
                                const nId = handlerName.replace('_' + evtName + '_handler', '');
                                node.id = nId;
                                if(eventMap[nId] && eventMap[nId][evtName]) action = eventMap[nId][evtName];
                            }
                            node.events.push({ name: evtName, action: action });
                        } else {
                            node.props.push({ name: attr.name, value: attr.value });
                        }
                    }
                    for(let child of element.childNodes) {
                        const parsed = parseNode(child);
                        if(typeof parsed === 'string') {
                            node.text += (node.text ? ' ' : '') + parsed;
                        } else if (parsed) {
                            node.children.push(parsed);
                        }
                    }
                    return node;
                };
                const newNodes = [];
                for(let child of template.content.childNodes) {
                    const parsed = parseNode(child);
                    if(parsed && typeof parsed !== 'string') newNodes.push(parsed);
                }
                canvasComponents.value = newNodes;
            } catch(err) { console.error("Parse error:", err); }
        }
    });

    const publishPage = async () => {
        publishing.value = true;
        try {
            await new Promise(r => setTimeout(r, 500));
            alert("SAYFA BAŞARIYLA YAYINLANDI! (Mock)\n\nGerçek API entegrasyonu backend'inize bağlanacak.");
        } catch(e) {}
        publishing.value = false;
    };

    return { MiniMonaco, CanvasNode, viewMode, pageSlug, publishing, searchComponent,
      filteredComponents, canvasComponents, selectedId, selectedComponent,
      onDragStart, onDragOver, onDrop, handleDropOnNode,
      selectComponent, removeComponent,
      addProp, removeProp, addEvent, removeEvent,
      getAvailableProps, getAvailableEvents,
      generatedCode, publishPage
    };