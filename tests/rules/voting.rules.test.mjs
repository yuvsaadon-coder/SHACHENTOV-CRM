import test, { before, after, beforeEach } from 'node:test'
import fs from 'node:fs'
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs } from 'firebase/firestore'

let env
before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-voting', firestore: { rules: fs.readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8085 } })
})
after(async () => { await env.cleanup() })
beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'users/c1'), { role: 'coordinator', active: true, branchIds: ['B1'] })
    await setDoc(doc(db, 'users/c2'), { role: 'coordinator', active: true, branchIds: ['B2'] })
    await setDoc(doc(db, 'users/hq1'), { role: 'hq', active: true })
    await setDoc(doc(db, 'users/adm'), { role: 'admin', active: true })
    await setDoc(doc(db, 'users/nobody'), { role: 'none', active: true })
    await setDoc(doc(db, 'users/gone'), { role: 'coordinator', active: false, branchIds: ['B1'] })
    await setDoc(doc(db, 'voting_config/main'), { round: { num: 1, open: true } })
    await setDoc(doc(db, 'voting_votes/c2_B2'), { uid: 'c2', branchId: 'B2', name: 'x', submittedAt: 1, baskets: {} })
    await setDoc(doc(db, 'voting_priceQuotes/q1'), { supplierName: 'x' })
    await setDoc(doc(db, 'tasks/t1'), { title: 'x' })
  })
})
const as = (uid) => env.authenticatedContext(uid).firestore()
const vote = (uid, branchId, extra = {}) => ({ uid, branchId, name: 'n', submittedAt: 2, baskets: { a: { pasta: 2 } }, round: 1, ...extra })

test('1. coordinator writes own vote for own branch', async () => { await assertSucceeds(setDoc(doc(as('c1'), 'voting_votes/c1_B1'), vote('c1', 'B1'))) })
test('2. not for a branch that is not theirs', async () => { await assertFails(setDoc(doc(as('c1'), 'voting_votes/c1_B2'), vote('c1', 'B2'))) })
test('3. not in someone else\'s name', async () => { await assertFails(setDoc(doc(as('c1'), 'voting_votes/c2_B1'), vote('c2', 'B1'))) })
test('4. document id must match uid and branch', async () => { await assertFails(setDoc(doc(as('c1'), 'voting_votes/other'), vote('c1', 'B1'))) })
test('5. update own vote; no extra fields', async () => {
  await assertSucceeds(setDoc(doc(as('c1'), 'voting_votes/c1_B1'), vote('c1', 'B1')))
  await assertSucceeds(updateDoc(doc(as('c1'), 'voting_votes/c1_B1'), { submittedAt: 3 }))
  await assertFails(setDoc(doc(as('c1'), 'voting_votes/c1_B1'), vote('c1', 'B1', { weight: 9 })))
})
test('6. reads own vote (also before it exists), never another\'s', async () => {
  await assertSucceeds(getDoc(doc(as('c1'), 'voting_votes/c1_B1')))
  await assertFails(getDoc(doc(as('c1'), 'voting_votes/c2_B2')))
})
test('7. only HQ lists all votes', async () => {
  await assertFails(getDocs(collection(as('c1'), 'voting_votes')))
  await assertSucceeds(getDocs(collection(as('hq1'), 'voting_votes')))
})
test('8. closed round blocks coordinator writes', async () => {
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'voting_config/main'), { round: { num: 1, open: false } }))
  await assertFails(setDoc(doc(as('c1'), 'voting_votes/c1_B1'), vote('c1', 'B1')))
})
test('9. coordinator cannot delete votes; HQ can (archiving)', async () => {
  await assertFails(deleteDoc(doc(as('c2'), 'voting_votes/c2_B2')))
  await assertSucceeds(deleteDoc(doc(as('hq1'), 'voting_votes/c2_B2')))
})
test('10. config: everyone signed in reads, only HQ writes', async () => {
  await assertSucceeds(getDoc(doc(as('c1'), 'voting_config/main')))
  await assertFails(setDoc(doc(as('c1'), 'voting_config/main'), { round: { num: 9, open: true } }))
  await assertSucceeds(setDoc(doc(as('hq1'), 'voting_config/main'), { products: [] }, { merge: true }))
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'voting_config/main')))
})
test('11. quotes: HQ only; delete only system managers', async () => {
  await assertFails(getDoc(doc(as('c1'), 'voting_priceQuotes/q1')))
  await assertSucceeds(getDoc(doc(as('hq1'), 'voting_priceQuotes/q1')))
  await assertFails(deleteDoc(doc(as('hq1'), 'voting_priceQuotes/q1')))
  await assertSucceeds(deleteDoc(doc(as('adm'), 'voting_priceQuotes/q1')))
})
test('12. archive: HQ adds, nobody edits', async () => {
  await assertSucceeds(setDoc(doc(as('hq1'), 'voting_archivedVotes/a1'), { round: 1 }))
  await assertFails(setDoc(doc(as('hq1'), 'voting_archivedVotes/a1'), { round: 2 }))
})
test('13. a person without access cannot vote; a deactivated coordinator cannot vote', async () => {
  await assertFails(setDoc(doc(as('nobody'), 'voting_votes/nobody_B1'), vote('nobody', 'B1')))
  await assertFails(setDoc(doc(as('gone'), 'voting_votes/gone_B1'), vote('gone', 'B1')))
})
test('14. signed-out: nothing', async () => {
  const anon = env.unauthenticatedContext().firestore()
  await assertFails(setDoc(doc(anon, 'voting_votes/x_B1'), vote('x', 'B1')))
  await assertFails(getDocs(collection(anon, 'voting_votes')))
})
test('15. existing CRM rules still work (tasks: HQ yes, coordinator no)', async () => {
  await assertSucceeds(getDoc(doc(as('hq1'), 'tasks/t1')))
  await assertFails(getDoc(doc(as('c1'), 'tasks/t1')))
})
test('16. voting branch settings: HQ writes, coordinator reads only', async () => {
  await assertSucceeds(setDoc(doc(as('hq1'), 'voting_branches/B1'), { votesIn: 'always' }))
  await assertSucceeds(getDoc(doc(as('c1'), 'voting_branches/B1')))
  await assertFails(setDoc(doc(as('c1'), 'voting_branches/B1'), { votesIn: 'never' }))
})
