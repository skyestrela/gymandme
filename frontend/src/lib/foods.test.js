import { describe, expect, it } from 'vitest'
import { FOODS, PORTIONS, foodById, foodLabel, macrosFor, portionGrams, searchFoods } from './foods.js'

describe('the food table', () => {
  it('has no entry that would quietly produce a negative number', () => {
    for (const f of FOODS) {
      expect(f.name, f.id).toBeTruthy()
      for (const k of ['kcal', 'p', 'c', 'f']) {
        expect(Number.isFinite(f[k]), `${f.id}.${k}`).toBe(true)
        expect(f[k], `${f.id}.${k}`).toBeGreaterThanOrEqual(0)
      }
      // A food with no portion is a food the table never offers a size for, which is the
      // whole point of the table - so every one has to offer at least one.
      expect(f.portions?.length, `${f.id} has no portion`).toBeGreaterThan(0)
      for (const p of f.portions) expect(PORTIONS[p], `${f.id} offers unknown portion ${p}`).toBeTruthy()
    }
  })

  it('finds walnuts from "walnut", which is the whole use of it', () => {
    expect(searchFoods('walnut')[0].id).toBe('walnuts')
    expect(searchFoods('walnuts')[0].id).toBe('walnuts')
    expect(searchFoods('WALNUT')[0].id).toBe('walnuts')
  })

  it('ignores accents, so the keyboard spelling still finds the food', () => {
    // jalapeno -> jalapeno; the table would carry the tilde form.
    expect(searchFoods('creme').length).toBeGreaterThanOrEqual(0)
    const names = searchFoods('creme').map(f => f.id)
    expect(names).toEqual(searchFoods('crème').map(f => f.id))
  })

  it('puts a prefix first, because that is what you are halfway through typing', () => {
    const ids = searchFoods('to').map(f => f.id)
    expect(ids).toContain('tofu-firm')
    expect(ids.indexOf('tofu-firm')).toBeLessThanOrEqual(1)
  })

  it('returns nothing for an empty query rather than the whole table', () => {
    expect(searchFoods('')).toEqual([])
    expect(searchFoods('   ')).toEqual([])
    expect(searchFoods(null)).toEqual([])
  })

  it('is stable, so the list does not shuffle under the same query', () => {
    expect(searchFoods('nut').map(f => f.id)).toEqual(searchFoods('nut').map(f => f.id))
  })

  it('weights the per-100 g figure rather than carrying its own numbers', () => {
    const w = foodById('walnuts')
    // Walnuts are 654 kcal / 100 g, so 30 g is a fifth of that.
    expect(macrosFor(w, 30).kcal).toBe(196)
    expect(macrosFor(w, 100).kcal).toBe(654)
    expect(macrosFor(w, 0).kcal).toBe(0)
  })

  it('never reports a negative macro for a negative amount', () => {
    const w = foodById('walnuts')
    expect(macrosFor(w, -50)).toMatchObject({ kcal: 0, p: 0, c: 0, f: 0, grams: 0 })
    expect(macrosFor(w, 'nonsense').kcal).toBe(0)
  })

  it('offers only the portions that mean something for that food', () => {
    const w = foodById('walnuts')
    expect(portionGrams(w, 'handful')).toBe(30)
    expect(portionGrams(w, 'spoon')).toBe(15)
    // A "fillet" of walnuts is not a thing.
    expect(portionGrams(w, 'fillet')).toBeNull()
    expect(portionGrams(foodById('salmon'), 'fillet')).toBe(150)
    expect(portionGrams(foodById('egg'), 'piece')).toBe(60)
    expect(portionGrams(null, 'handful')).toBeNull()
  })

  it('names a logged entry with the portion it came from', () => {
    expect(foodLabel(foodById('walnuts'), 30)).toBe('Walnuts, 30 g')
  })
})