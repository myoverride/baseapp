<template>
  <g class="er-relation-line" :class="{ 'er-relation-line--hover': isHovered }">
    <!-- Invisible wider path for easier hover -->
    <path
      :d="pathD"
      fill="none"
      stroke="transparent"
      stroke-width="12"
      style="cursor: pointer;"
      @mouseenter="isHovered = true"
      @mouseleave="isHovered = false"
      @click="$emit('click', relation)"
    />
    <!-- Visible path -->
    <path
      :d="pathD"
      fill="none"
      :stroke="isHovered ? '#C62828' : '#90A4AE'"
      :stroke-width="isHovered ? 2.5 : 1.5"
      stroke-dasharray="none"
      :marker-end="isHovered ? 'url(#arrowhead-active)' : 'url(#arrowhead)'"
      style="transition: stroke 0.2s, stroke-width 0.2s;"
    />
    <!-- Label -->
    <g v-if="label" :transform="labelTransform">
      <rect
        :x="-labelWidth / 2 - 4"
        :y="-7"
        :width="labelWidth + 8"
        height="14"
        rx="3"
        :fill="isHovered ? '#FFEBEE' : '#ECEFF1'"
        :stroke="isHovered ? '#C62828' : '#B0BEC5'"
        stroke-width="0.5"
      />
      <text
        text-anchor="middle"
        dominant-baseline="middle"
        :fill="isHovered ? '#C62828' : '#546E7A'"
        font-size="9"
        font-weight="600"
        letter-spacing="0.3"
      >
        {{ label }}
      </text>
    </g>
  </g>
</template>

<script setup lang="ts">
const props = defineProps<{
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  label?: string
  relation?: any
}>()

defineEmits<{
  click: [relation: any]
}>()

const isHovered = ref(false)

const pathD = computed(() => {
  const sx = props.sourceX
  const sy = props.sourceY
  const tx = props.targetX
  const ty = props.targetY

  const dx = Math.abs(tx - sx)
  const controlOffset = Math.max(50, dx * 0.4)

  // Determine direction for bezier control points
  if (sx < tx) {
    // Source is left of target
    return `M ${sx} ${sy} C ${sx + controlOffset} ${sy}, ${tx - controlOffset} ${ty}, ${tx} ${ty}`
  } else {
    // Source is right of target - curve the other way
    return `M ${sx} ${sy} C ${sx + controlOffset} ${sy}, ${tx - controlOffset} ${ty}, ${tx} ${ty}`
  }
})

const labelWidth = computed(() => {
  if (!props.label) return 0
  return props.label.length * 5.5 + 4
})

const labelTransform = computed(() => {
  const mx = (props.sourceX + props.targetX) / 2
  const my = (props.sourceY + props.targetY) / 2
  return `translate(${mx}, ${my})`
})
</script>

<style scoped>
.er-relation-line {
  pointer-events: auto;
}
</style>
