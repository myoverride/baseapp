<template>
  <div class="er-editor-wrapper">
    <!-- Toolbar -->
    <div class="er-toolbar">
      <div class="er-toolbar-left">
        <v-btn-group variant="tonal" density="compact" color="primary">
          <v-btn size="small" @click="zoomIn" :title="$t('er.zoomIn')" icon="mdi-magnify-plus-outline" />
          <v-btn size="small" class="er-zoom-label">{{ Math.round(zoom * 100) }}%</v-btn>
          <v-btn size="small" @click="zoomOut" :title="$t('er.zoomOut')" icon="mdi-magnify-minus-outline" />
          <v-btn size="small" @click="zoomReset" :title="$t('er.zoomReset')" icon="mdi-fit-to-screen-outline" />
        </v-btn-group>

        <v-btn size="small" variant="tonal" color="blue-grey" prepend-icon="mdi-auto-fix" @click="autoLayout"
          class="ml-2">
          {{ $t('er.autoLayout') }}
        </v-btn>
      </div>

      <div class="er-toolbar-right">
        <v-btn size="small" variant="flat" color="primary" prepend-icon="mdi-plus" @click="$emit('create-entity')">
          {{ $t('er.newEntity') }}
        </v-btn>
      </div>
    </div>

    <!-- Canvas Area -->
    <div class="er-canvas-wrapper" ref="canvasWrapper" @mousedown="onCanvasMouseDown" @wheel.prevent="onWheel">
      <!-- Dot Grid Background -->
      <div class="er-grid-bg" :style="gridBgStyle"></div>

      <!-- Zoomable/Pannable container -->
      <div class="er-canvas" ref="canvasRef" :style="canvasTransformStyle">

        <!-- SVG Relations Overlay (Underneath Entities) -->
        <svg class="er-relations-svg" :width="svgWidth" :height="svgHeight" :viewBox="`0 0 ${svgWidth} ${svgHeight}`">
          <defs>
            <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="#90A4AE" />
            </marker>
            <marker id="arrowhead-active" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="#C62828" />
            </marker>
          </defs>

          <ErRelationLine v-for="(rel, rIdx) in computedRelations" :key="rIdx" :source-x="rel.sourceX"
            :source-y="rel.sourceY" :target-x="rel.targetX" :target-y="rel.targetY" :label="rel.fieldName"
            :relation="rel" @click="onRelationClick" />
        </svg>

        <!-- Native Draggable Entities -->
        <div v-for="entity in entities" :key="entity.id" class="er-draggable-entity" :style="{
          left: `${getPosition(entity.id).x}px`,
          top: `${getPosition(entity.id).y}px`,
          zIndex: draggingId === String(entity.id) ? 100 : 10,
          width: '260px'
        }" @mousedown="onEntityMouseDown($event, String(entity.id))">
          <ErEntityCard :entity="entity" :color-index="getColorIndex(String(entity.id))"
            :ref="el => setCardRef(String(entity.id), el)" @edit-entity="onEditEntity" @delete-entity="onDeleteEntity"
            @add-field="onAddField" @edit-field="onEditField" @delete-field="onDeleteField" />
        </div>
      </div>

      <!-- Empty state -->
      <div v-if="!entities || entities.length === 0" class="er-empty-state">
        <v-icon size="64" color="secondary">mdi-database-off-outline</v-icon>
        <div class="text-h6 text-grey mt-3">{{ $t('er.noEntities') }}</div>
        <div class="text-body-2 text-medium-emphasis mt-1">{{ $t('er.createEntityToStart') }}</div>
        <v-btn class="mt-4" variant="flat" color="primary" prepend-icon="mdi-plus" @click="$emit('create-entity')">
          {{ $t('er.createFirstEntity') }}
        </v-btn>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps<{
  entities: any[]
}>()

const emit = defineEmits<{
  'entity-update': [entity: any]
  'entity-create': [data: any]
  'entity-delete': [entity: any]
  'edit-entity': [entity: any]
  'create-entity': []
}>()

// Refs
const canvasWrapper = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLElement | null>(null)
const cardRefs = ref<Record<string, any>>({})

// Zoom & Pan state
const zoom = ref(1)
const panX = ref(0)
const panY = ref(0)
const isPanningCanvas = ref(false)
const panStartX = ref(0)
const panStartY = ref(0)

// Native Drag State
const positions = ref<Record<string, { x: number, y: number }>>({})
const draggingId = ref<string | null>(null)
let dragStartX = 0
let dragStartY = 0
let entityStartX = 0
let entityStartY = 0



// SVG dimensions
const svgWidth = ref(4000)
const svgHeight = ref(4000)

// Relation position update trigger
const relationTick = ref(0)

// Color indices map
const colorMap = ref<Record<string, number>>({})

const setCardRef = (id: string, el: any) => {
  if (el) {
    cardRefs.value[id] = el
  }
}

const getColorIndex = (id: string) => {
  if (colorMap.value[id] == null) {
    colorMap.value[id] = Object.keys(colorMap.value).length
  }
  return colorMap.value[id]
}

const getPosition = (id: number | string) => {
  return positions.value[String(id)] || { x: 50, y: 50 }
}

// --- Zoom & Pan (Canvas) ---
const canvasTransformStyle = computed(() => ({
  transform: `translate(${panX.value}px, ${panY.value}px) scale(${zoom.value})`,
  transformOrigin: '0 0'
}))

const gridBgStyle = computed(() => ({
  backgroundSize: `${20 * zoom.value}px ${20 * zoom.value}px`,
  backgroundPosition: `${panX.value}px ${panY.value}px`
}))

const zoomIn = () => { zoom.value = Math.min(2, zoom.value + 0.1) }
const zoomOut = () => { zoom.value = Math.max(0.25, zoom.value - 0.1) }
const zoomReset = () => { zoom.value = 1; panX.value = 0; panY.value = 0 }

const onWheel = (e: WheelEvent) => {
  const delta = e.deltaY > 0 ? -0.05 : 0.05
  zoom.value = Math.max(0.25, Math.min(2, zoom.value + delta))
}

const onCanvasMouseDown = (e: MouseEvent) => {
  // If clicking directly on the canvas wrapper or middle button, pan the canvas
  if (e.button === 1 || (e.button === 0 && e.target === canvasWrapper.value)) {
    isPanningCanvas.value = true
    panStartX.value = e.clientX - panX.value
    panStartY.value = e.clientY - panY.value
    e.preventDefault()

    const onMouseMove = (ev: MouseEvent) => {
      if (isPanningCanvas.value) {
        panX.value = ev.clientX - panStartX.value
        panY.value = ev.clientY - panStartY.value
      }
    }
    const onMouseUp = () => {
      isPanningCanvas.value = false
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }
}

// --- Native Entity Dragging ---
const onEntityMouseDown = (e: MouseEvent, id: string) => {
  // Only allow dragging from header
  const target = e.target as HTMLElement
  if (!target.closest('.er-entity-header')) return

  if (e.button !== 0) return // only left click

  draggingId.value = id
  dragStartX = e.clientX
  dragStartY = e.clientY

  const currentPos = getPosition(id)
  entityStartX = currentPos.x
  entityStartY = currentPos.y

  const onMouseMove = (ev: MouseEvent) => {
    if (draggingId.value === id) {
      // Calculate delta taking zoom into account
      const dx = (ev.clientX - dragStartX) / zoom.value
      const dy = (ev.clientY - dragStartY) / zoom.value

      positions.value[id] = {
        x: Math.max(0, entityStartX + dx),
        y: Math.max(0, entityStartY + dy)
      }

      relationTick.value++
    }
  }

  const onMouseUp = () => {
    draggingId.value = null
    saveLayout()
    relationTick.value++
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  }

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

// --- Layout Management ---
const LAYOUT_STORAGE_KEY = 'er-diagram-layout-native'

const loadSavedLayout = () => {
  try {
    const saved = localStorage.getItem(LAYOUT_STORAGE_KEY)
    if (saved) {
      positions.value = JSON.parse(saved)
    }
  } catch {
    positions.value = {}
  }
}

const saveLayout = () => {
  localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(positions.value))
}

const initPositions = () => {
  loadSavedLayout()

  let layoutChanged = false

  props.entities.forEach((entity, idx) => {
    const id = String(entity.id)
    if (!positions.value[id]) {
      // Place newly added entities
      const col = idx % 5
      const row = Math.floor(idx / 5)
      positions.value[id] = {
        x: 40 + col * 320,
        y: 40 + row * 250
      }
      layoutChanged = true
    }
  })

  if (layoutChanged) saveLayout()
  nextTick(() => { relationTick.value++ })
}

const autoLayout = () => {
  const cols = Math.ceil(Math.sqrt(props.entities.length))

  props.entities.forEach((entity, idx) => {
    const id = String(entity.id)
    const col = idx % cols
    const row = Math.floor(idx / cols)

    positions.value[id] = {
      x: 40 + col * 320,
      y: 40 + row * 250
    }
  })

  saveLayout()
  relationTick.value++
}

// --- Relations Computation ---
const computedRelations = computed(() => {
  void relationTick.value // Re-run when layout moves

  const relations: any[] = []
  if (!canvasRef.value) return relations

  props.entities.forEach(entity => {
    const schema = entity.schema || {}
    const sourceId = String(entity.id)

    const sourcePos = getPosition(sourceId)
    // Find the rendered card element to compute height accurately
    const sourceCard = cardRefs.value[sourceId]?.$el || cardRefs.value[sourceId]?.cardRef
    const sourceHeight = sourceCard ? sourceCard.offsetHeight : 150
    const sourceWidth = 260 // Fixed width

    Object.entries(schema).forEach(([fieldName, fieldDef]: [string, any]) => {
      if (fieldDef.type === 'relation' && fieldDef.targetEntityId) {
        const targetId = String(fieldDef.targetEntityId)
        // Check if target entity exists
        if (!props.entities.find(e => String(e.id) === targetId)) return

        const targetPos = getPosition(targetId)
        const targetCard = cardRefs.value[targetId]?.$el || cardRefs.value[targetId]?.cardRef
        const targetHeight = targetCard ? targetCard.offsetHeight : 150

        // Ok her zaman kaynağın sağından (anchor noktasından) çıkar
        let sx = sourcePos.x + sourceWidth
        let sy = sourcePos.y + 40 // Fallback

        // Hedefin her zaman sol üst tarafına (header ortası) bağlanır
        let tx = targetPos.x
        let ty = targetPos.y + 16

        // DOM üzerinden gerçek Y noktasını tam isabetli hesapla
        const sourceCardEl = cardRefs.value[sourceId]?.$el || cardRefs.value[sourceId]?.cardRef || cardRefs.value[sourceId]
        if (sourceCardEl) {
          const safeFieldName = fieldName.replace(/"/g, '\\"')
          const anchorEl = sourceCardEl.querySelector(`.er-field-anchor[data-source-id="${sourceId}"][data-field-name="${safeFieldName}"]`)
          if (anchorEl) {
            const aRect = anchorEl.getBoundingClientRect()
            const cRect = sourceCardEl.getBoundingClientRect()
            // zoom oranına bölerek unscaled (gerçek) koordinat farkını buluyoruz
            const relativeY = (aRect.top - cRect.top + aRect.height / 2) / zoom.value
            sy = sourcePos.y + relativeY
          }
        }

        relations.push({
          sourceEntityId: sourceId,
          targetEntityId: targetId,
          fieldName,
          sourceX: sx,
          sourceY: sy,
          targetX: tx,
          targetY: ty
        })
      }
    })
  })

  return relations
})

// --- Entity Operations ---
const onEditEntity = (entity: any) => {
  emit('edit-entity', entity)
}

const onDeleteEntity = (entity: any) => {
  if (confirm(t('confirm.delete'))) {
    emit('entity-delete', entity)
    delete positions.value[String(entity.id)]
    saveLayout()
  }
}

// --- Field Operations ---
const onAddField = (entity: any) => {
  emit('edit-entity', entity)
}

const onEditField = (entity: any, field: any, index: number) => {
  emit('edit-entity', entity)
}

const onDeleteField = (entity: any, field: any, _index: number) => {
  if (!confirm(t('confirm.delete'))) return

  const schema = { ...(entity.schema || {}) }
  delete schema[field.name]

  let order = 0
  Object.keys(schema).forEach(key => {
    schema[key] = { ...schema[key], _order: order++ }
  })

  emit('entity-update', { ...entity, schema })
}

const onRelationClick = (rel: any) => {
  if (confirm(t('confirm.delete'))) {
    const entity = props.entities.find(e => String(e.id) === rel.sourceEntityId)
    if (entity) {
      const schema = { ...(entity.schema || {}) }
      delete schema[rel.fieldName]
      emit('entity-update', { ...entity, schema })
    }
  }
}

// --- Watchers ---
watch(() => props.entities, () => {
  initPositions()
}, { deep: true })

onMounted(() => {
  initPositions()
})
</script>

<style scoped>
.er-editor-wrapper {
  display: flex;
  flex-direction: column;
  height: 600px;
  min-height: 400px;
  border-radius: 0 0 8px 8px;
  overflow: hidden;
}

/* Toolbar */
.er-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  flex-shrink: 0;
  z-index: 10;
}

.er-toolbar-left,
.er-toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.er-zoom-label {
  font-size: 11px !important;
  font-weight: 600 !important;
  min-width: 48px !important;
  pointer-events: none;
}

/* Canvas */
.er-canvas-wrapper {
  flex: 1;
  position: relative;
  overflow: hidden;
  cursor: grab;
}

.er-canvas-wrapper:active {
  cursor: grabbing;
}

.er-grid-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  background-image: radial-gradient(circle, #d0d0d0 1px, transparent 1px);
  background-size: 20px 20px;
  pointer-events: none;
}

.er-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 4000px;
  height: 4000px;
  transition: transform 0.1s ease-out;
  /* Smooth zoom/pan */
}

/* SVG overlay for relations */
.er-relations-svg {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
  z-index: 5;
  overflow: visible;
}

/* Native Draggable Entities */
.er-draggable-entity {
  position: absolute;
  transition: box-shadow 0.2s ease;
}

/* Empty state */
.er-empty-state {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 20;
}
</style>
