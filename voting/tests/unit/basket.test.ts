import { expect, test } from 'vitest'
import { basketStatus, basketTotal, clampQty, cleanItems, isUnlocked } from '../../src/features/vote/basket'
import { toCsv } from '../../src/lib/csv'

const products = [{ id: 'pasta', price: 2.6 }, { id: 'oil', price: 7.32 }]

test('basket total and status thresholds (warn from 90%, over above 100%)', () => {
  expect(basketTotal({ pasta: 2, oil: 1, ghost: 3 }, products)).toBeCloseTo(12.52)
  expect(basketStatus(0, 80).state).toBe('empty')
  expect(basketStatus(71.9, 80).state).toBe('ok')
  expect(basketStatus(72, 80).state).toBe('warn')
  expect(basketStatus(80, 80).state).toBe('warn')
  expect(basketStatus(80.01, 80).state).toBe('over')
})

test('sequential unlocking: basket i opens only when every earlier basket is filled and within budget', () => {
  const budgets = [80, 20, 80, 20]
  expect(isUnlocked(0, [0, 0, 0, 0], budgets)).toBe(true)
  expect(isUnlocked(1, [0, 0, 0, 0], budgets)).toBe(false)
  expect(isUnlocked(1, [50, 0, 0, 0], budgets)).toBe(true)
  expect(isUnlocked(2, [50, 25, 0, 0], budgets)).toBe(false)
  expect(isUnlocked(3, [50, 20, 79, 0], budgets)).toBe(true)
})

test('quantities are clamped to [0, max] and zeros / hidden products are dropped on save', () => {
  expect(clampQty(-1, 10)).toBe(0)
  expect(clampQty(11, 10)).toBe(10)
  expect(cleanItems({ pasta: 0, oil: 2, veg: 1 }, new Set(['pasta', 'oil']))).toEqual({ oil: 2 })
})

test('csv has a BOM, quotes cells and neutralises formulas', () => {
  const csv = toCsv([['מוצר', 'סה"כ'], ['=HYPERLINK("x")', 3]])
  expect(csv.startsWith('﻿')).toBe(true)
  expect(csv).toContain('"סה""כ"')
  expect(csv).toContain(`"'=HYPERLINK(""x"")"`)
})
