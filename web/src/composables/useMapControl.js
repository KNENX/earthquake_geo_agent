import { createEventHook } from '@vueuse/core'

/**
 * 地图控制事件总线
 * 用于跨组件触发地图方法的纯粹解耦方案，替代全局的 window.mapInstance 暴露
 */
export const mapEventBus = createEventHook()
