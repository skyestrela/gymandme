// @vitest-environment happy-dom
// The body that fills. What matters here is that the level shown is the level that is logged, that
// the bubbles exist only while there is something to bubble through, and that every benefit is
// readable before it is earned rather than appearing out of nowhere.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRoot } from 'react-dom/client'
import WaterBody from './WaterBody.jsx'

let host, root
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove() })

const mount = props => act(() => root.render(<WaterBody {...props} />))

const fill = () => host.querySelector('.wl-body-fill')
const bubbles = () => host.querySelectorAll('.wl-bubble')
const rows = () => [...host.querySelectorAll('.wl-bench-row')]
const onRows = () => rows().filter(r => r.classList.contains('on'))
const label = () => host.querySelector('svg').getAttribute('aria-label')

describe('the fill', () => {
  it('says what is actually logged, in words a screen reader can use', () => {
    mount({ ml: 1250, goal: 2000 })
    expect(label()).toBe('1,250 of 2,000 ml, 63%')
    expect(host.querySelector('svg').getAttribute('role')).toBe('img')
  })

  it('is empty, with no water drawn at all, before the first glass', () => {
    mount({ ml: 0, goal: 2000 })
    expect(fill()).toBeNull()
    expect(label()).toBe('0 of 2,000 ml, 0%')
  })

  it('rises with the level, on the same body every time', () => {
    mount({ ml: 1000, goal: 2000 })
    expect(fill().getAttribute('y')).toBe('85')
    expect(fill().getAttribute('height')).toBe('85')
    mount({ ml: 500, goal: 2000 })
    expect(fill().getAttribute('y')).toBe('127.5')
  })

  it('stops at the top rather than scaling past it however far you drink', () => {
    mount({ ml: 6000, goal: 2000 })
    expect(fill().getAttribute('y')).toBe('0')
    expect(host.textContent).toContain('Goal reached')
    expect(label()).toBe('6,000 of 2,000 ml, 100%')
  })

  it('draws nothing at all rather than divide by a goal of zero', () => {
    mount({ ml: 500, goal: 0 })
    expect(fill()).toBeNull()
    expect(host.querySelector('.wl-pct').textContent).toBe('0%')
  })

  it('reports what is left in plain language', () => {
    mount({ ml: 1250, goal: 2000 })
    expect(host.textContent).toContain('750 ml to go')
    mount({ ml: 2000, goal: 2000 })
    expect(host.textContent).not.toContain('to go')
  })
})

describe('the bubbles', () => {
  it('rise only in the sheet, where the body is big enough to read them in', () => {
    mount({ ml: 500, goal: 2000, size: 'lg' })
    expect(bubbles().length).toBe(5)
    mount({ ml: 500, goal: 2000, size: 'sm' })
    expect(bubbles().length).toBe(0)
  })

  it('are not there when there is no water, and gone again once the goal is met', () => {
    mount({ ml: 0, goal: 2000, size: 'lg' })
    expect(bubbles().length).toBe(0)
    mount({ ml: 2000, goal: 2000, size: 'lg' })
    expect(bubbles().length).toBe(0)
  })

  it('are staggered, so they never climb in a line', () => {
    mount({ ml: 500, goal: 2000, size: 'lg' })
    const delays = [...bubbles()].map(b => b.style.animationDelay)
    expect(new Set(delays).size).toBe(bubbles().length)
  })
})

describe('what hydration is doing', () => {
  it('keeps every row in place, dimmed, until its part of the day is reached', () => {
    mount({ ml: 480, goal: 2000, size: 'lg', showBenefits: true })
    expect(rows()).toHaveLength(4)
    expect(onRows()).toHaveLength(0)
    expect(host.textContent).toContain('Fewer headaches')
  })

  it('lights each one as the water gets there, in order', () => {
    mount({ ml: 500, goal: 2000, size: 'lg', showBenefits: true })
    expect(onRows()).toHaveLength(1)
    mount({ ml: 1000, goal: 2000, size: 'lg', showBenefits: true })
    expect(onRows()).toHaveLength(2)
    mount({ ml: 1500, goal: 2000, size: 'lg', showBenefits: true })
    expect(onRows()).toHaveLength(3)
    mount({ ml: 2000, goal: 2000, size: 'lg', showBenefits: true })
    expect(onRows()).toHaveLength(4)
    expect(host.textContent).toContain('Stronger in the session')
  })

  it('points at the body with a dot and a leader per benefit', () => {
    mount({ ml: 2000, goal: 2000, size: 'lg', showBenefits: true })
    expect(host.querySelectorAll('.wl-body-leaders')).toHaveLength(4)
    expect(rows().every(r => r.querySelector('.wl-bench-dot'))).toBe(true)
  })

  it('is left out entirely when the card is not asking for it', () => {
    mount({ ml: 500, goal: 2000, size: 'sm' })
    expect(rows()).toHaveLength(0)
  })

  it('keeps the titles but drops the reasons and the leaders on the card', () => {
    mount({ ml: 500, goal: 2000, size: 'sm', showBenefits: true, compact: true })
    expect(rows()).toHaveLength(4)
    expect(host.textContent).toContain('Fewer headaches')
    expect(host.textContent).toContain('Stronger in the session')
    expect(host.textContent).not.toContain('Mild dehydration is a common trigger.')
    // The elbow is drawn to a fixed point on a body big enough to carry it; at 60px it is a smudge.
    expect(host.querySelectorAll('.wl-body-leaders')).toHaveLength(0)
    expect(rows().every(r => r.querySelector('.wl-bench-dot'))).toBe(true)
  })
})