/**
 * 卡片 kind → 渲染组件注册表。
 *
 * 面板只按 kind 取组件，不再对 kind 做 if/else；新增卡型时在这里登记，
 * 未知 kind 回落到通用卡片，避免一条脏数据把整段消息渲染坏。
 */
import type { Component } from 'vue';
import {
  DATABUS_CARD_KIND_CHOICE,
  DATABUS_CARD_KIND_CONFIRM,
  DATABUS_CARD_KIND_REF
} from '@/constants/databus-common';
import AgentCardBlock from './AgentCardBlock.vue';

const REGISTRY: Record<string, Component> = {
  [DATABUS_CARD_KIND_CONFIRM]: AgentCardBlock,
  [DATABUS_CARD_KIND_CHOICE]: AgentCardBlock,
  [DATABUS_CARD_KIND_REF]: AgentCardBlock
};

/**
 * 取卡片渲染组件。
 *
 * @param kind 卡片类型
 * @returns 对应组件；未登记的类型回落到通用卡片
 */
export function cardViewOf(kind: string): Component {
  return REGISTRY[kind] ?? AgentCardBlock;
}
