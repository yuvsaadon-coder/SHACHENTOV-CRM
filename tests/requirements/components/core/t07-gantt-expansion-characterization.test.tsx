// TEST-T07 — Gantt expansion / clamping / child omission characterization.
// Requirements: T10a / E04. Layer V. Family classification: C (characterization).
//
// Per TEST-PLAN.md §6.T row T07 and TEST-PLAN.md P09 (src/components/gantt/
// GanttView.tsx cited lines 12-148):
//   GIVEN a one-off month-edge task, an undated task, a Jan-31 recurring task
//         and a parent/child pair;
//   WHEN the real GanttView renders in single-month mode for September 2026;
//   THEN each bar's rendered pixel position/day-span matches an INDEPENDENTLY
//        HAND-COMPUTED expectation (not by calling the component's own
//        expand* helpers), the undated task never produces a row, the Jan-31
//        recurring task is clamped to the month's last day, and the child
//        (has parentTaskId) is omitted from the top-level rows per
//        GanttView.tsx:106 `baseTasks = tasks.filter(t => !t.parentTaskId)`.
//
// This is `(C)` characterization: we are NOT approving the six-day bar rule
// or the day-of-month clamp as a requirement — we are asserting that the
// component's actual current behavior matches an independent recomputation
// of exactly that same algorithm.
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Timestamp } from 'firebase/firestore'

import { GanttView } from '../../../../src/components/gantt/GanttView'
import type { Task } from '../../../../src/types'

// Hand-picked frozen view: single-month September 2026.
const YEAR = 2026
const MONTH_INDEX = 8 // September (0-based)
const SINGLE_MONTH = new Date(YEAR, MONTH_INDEX, 1)
const M_START = new Date(YEAR, MONTH_INDEX, 1)
const M_END = new Date(YEAR, MONTH_INDEX + 1, 0) // Sep 30
const TOTAL_DAYS = Math.max(1, (M_END.getTime() - M_START.getTime()) / (1000 * 60 * 60 * 24))

// Independently reproduced pct/bw formulas (mirror of GanttView.tsx:139-141)
// but hand-inlined here so we're not calling the component's own helper.
const pct = (d: Date) =>
  Math.max(0, Math.min(100, (d.getTime() - M_START.getTime()) / (1000 * 60 * 60 * 24) / TOTAL_DAYS * 100))
const bw = (s: Date, e: Date) =>
  Math.max(0.5, (e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24) / TOTAL_DAYS * 100)

function makeTask(overrides: Partial<Task> & { id: string; title: string; domain?: Task['domain'] }): Task {
  return {
    domain: overrides.domain ?? 'FIN',
    category: 'chr',
    steps: '',
    frequency: 'חד-פעמי',
    startDate: null,
    endDate: null,
    holidayAnchor: null,
    involved: [],
    activator: null,
    contactRefs: [],
    status: 'בעבודה',
    notes: '',
    createdAt: Timestamp.fromDate(new Date(YEAR, 7, 1)),
    updatedAt: Timestamp.fromDate(new Date(YEAR, 7, 1)),
    createdBy: 'a',
    updatedBy: 'a',
    ...overrides,
  }
}

// Fixture rows — hand-authored, deliberately not sourced from support/core-fixtures.
const TASK_EDGE = makeTask({
  id: 'edge-span',
  title: 'משימת קצה חודש',
  frequency: 'חד-פעמי',
  startDate: Timestamp.fromDate(new Date(YEAR, 7, 25)),  // Aug 25 2026 (before month start)
  endDate: Timestamp.fromDate(new Date(YEAR, MONTH_INDEX, 5)),   // Sep 5 2026
})

const TASK_UNDATED = makeTask({
  id: 'no-dates',
  title: 'משימה ללא תאריכים',
  frequency: 'חד-פעמי',
  startDate: null,
  endDate: null,
})

// Recurring monthly, canonical instance date is Jan-31 (which cannot exist
// in September). GanttView.tsx:107-110 clamps to Math.min(end.getDate(), mEnd.getDate()).
const TASK_JAN31 = makeTask({
  id: 'jan31-recurring',
  title: 'משימה חודשית 31',
  frequency: 'חודשי',
  startDate: Timestamp.fromDate(new Date(YEAR, 0, 31)),
  endDate: Timestamp.fromDate(new Date(YEAR, 0, 31)),
})

const TASK_PARENT = makeTask({
  id: 'parent-t',
  title: 'משימת אב',
  frequency: 'חד-פעמי',
  startDate: Timestamp.fromDate(new Date(YEAR, MONTH_INDEX, 10)),
  endDate: Timestamp.fromDate(new Date(YEAR, MONTH_INDEX, 15)),
})

const TASK_CHILD: Task = {
  ...makeTask({
    id: 'child-t',
    title: 'משימת ילד',
    frequency: 'חד-פעמי',
    startDate: Timestamp.fromDate(new Date(YEAR, MONTH_INDEX, 12)),
    endDate: Timestamp.fromDate(new Date(YEAR, MONTH_INDEX, 14)),
  }),
  parentTaskId: 'parent-t',
}

const TASKS: Task[] = [TASK_EDGE, TASK_UNDATED, TASK_JAN31, TASK_PARENT, TASK_CHILD]

// Locate a task's rendered bar. Structure per GanttView.tsx:204-220:
//   TaskBarRow → outer div contains title text; the .absolute.top-2.h-6 div
//   is the actual bar with `style.right` and `style.width` as percentages.
function findBarForTitle(title: string): HTMLElement {
  const titleNode = screen.getByText(title)
  const row = titleNode.closest('div.flex.items-center.border-b')
  expect(row, `row wrapper for "${title}" not found`).toBeTruthy()
  const bar = row!.querySelector<HTMLDivElement>('div.absolute.top-2.h-6')
  expect(bar, `bar element for "${title}" not found`).toBeTruthy()
  return bar!
}

function readBar(el: HTMLElement) {
  const rightNum = Number.parseFloat(el.style.right.replace('%', ''))
  const widthNum = Number.parseFloat(el.style.width.replace('%', ''))
  return { right: rightNum, width: widthNum }
}

describe('TEST-T07 — Gantt expansion/clamping/child omission (V, family=C)', () => {
  it('TEST-T07.single-month-hand-computed (C) — September 2026 single-month view', () => {
    render(
      <MemoryRouter>
        <GanttView tasks={TASKS} singleMonth={SINGLE_MONTH} />
      </MemoryRouter>
    )

    // Undated task never yields a bar (GanttView.tsx:88 short-circuits on !t.endDate).
    expect(screen.queryByText(TASK_UNDATED.title)).not.toBeInTheDocument()

    // Child task omitted from top-level rows (GanttView.tsx:106).
    expect(screen.queryByText(TASK_CHILD.title)).not.toBeInTheDocument()

    // Edge-span task: startDate=Aug 25 → clamped to mStart=Sep 1; endDate=Sep 5
    // (GanttView.tsx:92-97). Independent hand-computed bar:
    const edgeExpectedStart = new Date(YEAR, MONTH_INDEX, 1)
    const edgeExpectedEnd = new Date(YEAR, MONTH_INDEX, 5)
    const edgeBar = readBar(findBarForTitle(TASK_EDGE.title))
    expect(edgeBar.right).toBeCloseTo(pct(edgeExpectedStart), 6)
    expect(edgeBar.width).toBeCloseTo(bw(edgeExpectedStart, edgeExpectedEnd), 6)

    // Jan-31 recurring monthly task: default branch (GanttView.tsx:100-104)
    // dom = min(end.getDate()=31, mEnd.getDate()=30) = 30
    // barStart = Sep 30, barEnd = Sep min(30+6=36, 30) = Sep 30 → zero-width
    // clamped to min 0.5.
    const jan31ExpectedStart = new Date(YEAR, MONTH_INDEX, 30)
    const jan31ExpectedEnd = new Date(YEAR, MONTH_INDEX, 30)
    const jan31Bar = readBar(findBarForTitle(TASK_JAN31.title))
    expect(jan31Bar.right).toBeCloseTo(pct(jan31ExpectedStart), 6)
    expect(jan31Bar.width).toBeCloseTo(bw(jan31ExpectedStart, jan31ExpectedEnd), 6)
    // ...and the min-0.5 clamp actually kicks in for this case:
    expect(jan31Bar.width).toBeCloseTo(0.5, 6)

    // Parent task: dated fully within the month, bar spans Sep 10 → Sep 15.
    const parentBar = readBar(findBarForTitle(TASK_PARENT.title))
    expect(parentBar.right).toBeCloseTo(pct(new Date(YEAR, MONTH_INDEX, 10)), 6)
    expect(parentBar.width).toBeCloseTo(bw(new Date(YEAR, MONTH_INDEX, 10), new Date(YEAR, MONTH_INDEX, 15)), 6)
  })
})
