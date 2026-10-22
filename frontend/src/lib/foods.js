/* A small food table, so a name is enough.
 *
 * Before this, logging a meal meant typing four numbers by hand or looking them up
 * somewhere else, which is exactly the friction that stops people logging at all. Here you
 * type "walnut" and get the numbers with the portion they came from attached, because
 * "how much" is the part that was missing, not the macros - anyone can be told a walnut is
 * 654 kcal per 100 g and still not know whether they ate a spoonful or the whole bag.
 *
 * Every value is per 100 g of the edible portion, raw unless the name says otherwise, from
 * USDA FoodData Central standard reference values. They are typical values for a food, not
 * a measurement of your walnuts: brands, ripeness and cooking move them around, and a
 * table that pretended to ten significant figures would be lying about a number nobody
 * weighs to that precision. Round to the nearest 5 or so and leave it there.
 *
 * Portions are structural rather than text: each food names the handfuls, spoons and
 * fillets that actually mean something for it. A "cup" of walnuts and a "cup" of oats are
 * not the same object, and baking "a cup" into 240 g of everything would quietly lie about
 * both.
 */

/** The handfuls, spoons and fillets a food can offer. Grams are a typical serving. */
export const PORTIONS = Object.freeze({
  handful: { g: 30, label: 'a handful' },
  spoon: { g: 15, label: 'a spoon' },
  cup: { g: 240, label: 'a cup' },
  medium: { g: 150, label: 'a medium one' },
  slice: { g: 30, label: 'a slice' },
  fillet: { g: 150, label: 'a fillet' },
  piece: { g: 60, label: 'a piece' },
})

/* id, name, per-100 g kcal/p/c/f, and the portions that mean something for it. */
const F = (id, name, kcal, p, c, f, portions, alias) => ({ id, name, kcal, p, c, f, portions, alias })

export const FOODS = Object.freeze([
  /* ---- nuts and seeds ---- */
  F('walnuts', 'Walnuts', 654, 15.2, 13.7, 65.2, ['handful', 'spoon'], ['walnut', 'walnuts', 'english walnut', 'walnut halves', 'pecan', 'pecans']),
  F('almonds', 'Almonds', 579, 21.2, 21.6, 49.9, ['handful', 'spoon'], ['almond', 'almonds']),
  F('cashews', 'Cashews', 553, 18.2, 30.2, 43.9, ['handful', 'spoon'], ['cashew', 'cashews']),
  F('peanuts', 'Peanuts', 567, 25.8, 16.1, 49.2, ['handful', 'spoon'], ['peanut', 'peanuts', 'groundnut']),
  F('hazelnuts', 'Hazelnuts', 628, 15.0, 16.7, 60.8, ['handful', 'spoon'], ['hazelnut', 'hazelnuts']),
  F('pistachios', 'Pistachios', 560, 20.2, 27.2, 45.3, ['handful', 'spoon'], ['pistachio', 'pistachios']),
  F('chia', 'Chia seeds', 486, 16.5, 42.1, 30.7, ['spoon'], ['chia', 'chia seed', 'chia seeds']),
  F('pumpkin-seeds', 'Pumpkin seeds', 559, 30.2, 10.7, 49.1, ['handful', 'spoon'], ['pumpkin seed', 'pumpkin seeds', 'pepita']),
  F('sunflower-seeds', 'Sunflower seeds', 584, 20.8, 20.0, 51.5, ['handful', 'spoon'], ['sunflower seed', 'sunflower seeds']),
  F('peanut-butter', 'Peanut butter', 588, 25.1, 20.0, 50.4, ['spoon'], ['peanut butter', 'pb']),
  F('almond-butter', 'Almond butter', 614, 21.0, 18.8, 55.5, ['spoon'], ['almond butter']),
  F('tahini', 'Tahini', 595, 17.0, 21.2, 53.8, ['spoon'], ['tahini', 'sesame paste']),

  /* ---- eggs ---- */
  F('egg', 'Egg, whole', 143, 12.6, 0.7, 9.5, ['piece'], ['egg', 'eggs', 'whole egg', 'boiled egg']),
  F('egg-white', 'Egg white', 52, 10.9, 0.7, 0.2, ['piece'], ['egg white', 'egg whites']),

  /* ---- meat and fish ---- */
  F('chicken-breast', 'Chicken breast', 120, 22.5, 0, 2.6, ['fillet'], ['chicken', 'chicken breast', 'chicken breasts', 'grilled chicken']),
  F('chicken-thigh', 'Chicken thigh', 177, 24.8, 0, 8.2, ['fillet'], ['chicken thigh', 'chicken thighs']),
  F('beef-mince', 'Beef mince, 5% fat', 137, 21.4, 0, 5.0, ['fillet'], ['beef mince', 'mince', 'ground beef', 'beef']),
  F('steak', 'Steak, lean', 170, 22.0, 0, 9.0, ['fillet'], ['steak', 'beef steak', 'sirloin']),
  F('pork-loin', 'Pork loin', 143, 21.0, 0, 6.0, ['fillet'], ['pork', 'pork loin', 'pork chop']),
  F('bacon', 'Bacon, cooked', 458, 24.9, 0.2, 36.6, ['slice'], ['bacon', 'streaky bacon', 'rasher']),
  F('salmon', 'Salmon', 208, 20.4, 0, 13.4, ['fillet'], ['salmon', 'atlantic salmon', 'fish']),
  F('tuna', 'Tuna, canned in water', 116, 25.5, 0, 0.8, ['slice'], ['tuna', 'canned tuna', 'tinned tuna']),
  F('cod', 'Cod', 82, 17.8, 0, 0.7, ['fillet'], ['cod', 'white fish']),
  F('prawns', 'Prawns', 99, 24.0, 0.2, 0.3, ['handful'], ['prawn', 'prawns', 'shrimp']),
  F('sardines', 'Sardines, canned in oil', 208, 24.6, 0, 11.5, ['slice'], ['sardine', 'sardines']),

  /* ---- dairy and eggs alternatives ---- */
  F('greek-yogurt', 'Greek yogurt, 2%', 73, 10.0, 3.6, 2.0, ['cup'], ['greek yogurt', 'greek yoghurt', 'skyr']),
  F('yogurt', 'Yogurt, plain', 61, 3.5, 4.7, 3.3, ['cup'], ['yogurt', 'yoghurt', 'natural yogurt']),
  F('milk', 'Milk, whole', 61, 3.2, 4.8, 3.3, ['cup'], ['milk', 'whole milk', 'full fat milk']),
  F('skimmed-milk', 'Milk, skimmed', 34, 3.4, 5.0, 0.1, ['cup'], ['skimmed milk', 'skim milk', 'non fat milk']),
  F('cheddar', 'Cheddar cheese', 403, 24.9, 1.3, 33.1, ['slice'], ['cheddar', 'cheese', 'cheddar cheese']),
  F('mozzarella', 'Mozzarella', 254, 24.3, 2.8, 15.9, ['slice'], ['mozzarella', 'mozzarella cheese']),
  F('cottage-cheese', 'Cottage cheese, 2%', 84, 11.0, 4.3, 2.3, ['cup'], ['cottage cheese']),
  F('butter', 'Butter', 717, 0.9, 0.1, 81.1, ['spoon'], ['butter']),

  /* ---- grains and starches ---- */
  F('oats', 'Oats, rolled', 389, 16.9, 66.3, 6.9, ['cup'], ['oats', 'oatmeal', 'porridge', 'rolled oats']),
  F('rice-white', 'Rice, white', 130, 2.7, 28.2, 0.3, ['cup'], ['rice', 'white rice']),
  F('rice-brown', 'Rice, brown', 123, 2.7, 25.6, 1.0, ['cup'], ['brown rice']),
  F('pasta', 'Pasta, cooked', 158, 5.8, 30.9, 0.9, ['cup'], ['pasta', 'spaghetti', 'noodles', 'penne']),
  F('bread-white', 'Bread, white', 265, 9.0, 49.0, 3.2, ['slice'], ['bread', 'white bread', 'toast']),
  F('bread-wholemeal', 'Bread, wholemeal', 246, 8.9, 45.4, 3.2, ['slice'], ['wholemeal bread', 'whole wheat bread', 'brown bread', 'brown toast']),
  F('quinoa', 'Quinoa, cooked', 120, 4.4, 21.3, 1.9, ['cup'], ['quinoa']),
  F('couscous', 'Couscous, cooked', 112, 3.8, 23.2, 0.2, ['cup'], ['couscous']),
  F('sweet-potato', 'Sweet potato, baked', 90, 2.0, 20.7, 0.2, ['medium'], ['sweet potato', 'sweet potatoes']),
  F('potato', 'Potato, boiled', 87, 1.9, 20.1, 0.1, ['medium'], ['potato', 'potatoes', 'boiled potato']),
  F('tortilla', 'Tortilla, flour', 306, 8.2, 51.4, 7.3, ['piece'], ['tortilla', 'wrap', 'tortillas']),

  /* ---- legumes and plant protein ---- */
  F('chickpeas', 'Chickpeas, cooked', 164, 8.9, 27.4, 2.6, ['cup'], ['chickpea', 'chickpeas', 'garbanzo', 'garbanzos']),
  F('lentils', 'Lentils, cooked', 116, 9.0, 20.1, 0.4, ['cup'], ['lentil', 'lentils', 'dal', 'daal']),
  F('kidney-beans', 'Kidney beans, cooked', 127, 8.7, 22.8, 0.5, ['cup'], ['kidney beans', 'kidney bean', 'beans']),
  F('black-beans', 'Black beans, cooked', 132, 8.9, 23.7, 0.5, ['cup'], ['black beans', 'black bean']),
  F('tofu-firm', 'Tofu, firm', 144, 17.3, 2.8, 8.7, ['slice'], ['tofu', 'firm tofu', 'bean curd']),
  F('tofu-silken', 'Tofu, silken', 55, 5.2, 2.9, 2.7, ['slice'], ['silken tofu', 'soft tofu']),
  F('tempeh', 'Tempeh', 192, 20.3, 7.6, 10.8, ['slice'], ['tempeh']),
  F('seitan', 'Seitan', 141, 24.7, 13.8, 1.9, ['slice'], ['seitan', 'wheat protein']),

  /* ---- vegetables ---- */
  F('broccoli', 'Broccoli', 34, 2.8, 6.6, 0.4, ['cup'], ['broccoli', 'broccoli florets']),
  F('spinach', 'Spinach', 23, 2.9, 3.6, 0.4, ['cup'], ['spinach', 'spinach leaves']),
  F('kale', 'Kale', 49, 4.3, 8.8, 0.9, ['cup'], ['kale']),
  F('carrot', 'Carrot', 41, 0.9, 9.6, 0.2, ['medium'], ['carrot', 'carrots']),
  F('tomato', 'Tomato', 18, 0.9, 3.9, 0.2, ['medium'], ['tomato', 'tomatoes']),
  F('cucumber', 'Cucumber', 15, 0.7, 3.6, 0.1, ['medium'], ['cucumber']),
  F('pepper', 'Bell pepper', 31, 1.0, 6.0, 0.3, ['medium'], ['bell pepper', 'capsicum', 'peppers']),
  F('onion', 'Onion', 40, 1.1, 9.3, 0.1, ['medium'], ['onion', 'onions']),
  F('cauliflower', 'Cauliflower', 25, 1.9, 5.0, 0.3, ['cup'], ['cauliflower']),
  F('courgette', 'Courgette', 17, 1.2, 3.1, 0.3, ['medium'], ['courgette', 'zucchini']),
  F('mushrooms', 'Mushrooms', 22, 3.1, 3.3, 0.3, ['cup'], ['mushroom', 'mushrooms', 'button mushrooms']),
  F('green-beans', 'Green beans', 31, 1.8, 7.0, 0.2, ['cup'], ['green beans', 'string beans']),
  F('asparagus', 'Asparagus', 20, 2.2, 3.9, 0.1, ['cup'], ['asparagus']),
  F('beetroot', 'Beetroot', 43, 1.6, 10.0, 0.2, ['medium'], ['beetroot', 'beets']),

  /* ---- fruit ---- */
  F('banana', 'Banana', 89, 1.1, 22.8, 0.3, ['medium'], ['banana', 'bananas']),
  F('apple', 'Apple', 52, 0.3, 13.8, 0.2, ['medium'], ['apple', 'apples']),
  F('orange', 'Orange', 47, 0.9, 11.8, 0.1, ['medium'], ['orange', 'oranges']),
  F('strawberries', 'Strawberries', 32, 0.7, 7.7, 0.3, ['cup'], ['strawberry', 'strawberries']),
  F('blueberries', 'Blueberries', 57, 0.7, 14.5, 0.3, ['cup'], ['blueberry', 'blueberries']),
  F('raspberries', 'Raspberries', 52, 1.2, 11.9, 0.7, ['cup'], ['raspberry', 'raspberries']),
  F('grapes', 'Grapes', 69, 0.7, 18.1, 0.2, ['cup'], ['grape', 'grapes']),
  F('mango', 'Mango', 60, 0.8, 15.0, 0.4, ['medium'], ['mango', 'mangoes', 'mangos']),
  F('kiwi', 'Kiwi', 61, 1.1, 14.7, 0.5, ['piece'], ['kiwi', 'kiwifruit', 'kiwi fruit']),
  F('avocado', 'Avocado', 160, 2.0, 8.5, 14.7, ['piece'], ['avocado', 'avocados']),
  F('raisins', 'Raisins', 299, 3.1, 79.0, 0.5, ['handful'], ['raisin', 'raisins', 'sultanas']),
  F('dates', 'Dates', 277, 1.8, 75.0, 0.2, ['handful'], ['date', 'dates', 'medjool']),

  /* ---- oils, fats and sugars ---- */
  F('olive-oil', 'Olive oil', 884, 0, 0, 100, ['spoon'], ['olive oil', 'evoo']),
  F('coconut-oil', 'Coconut oil', 892, 0, 0, 99, ['spoon'], ['coconut oil']),
  F('mayonnaise', 'Mayonnaise', 680, 1.0, 1.0, 75, ['spoon'], ['mayonnaise', 'mayo']),
  F('honey', 'Honey', 304, 0.3, 82.4, 0, ['spoon'], ['honey', 'runny honey']),
  F('sugar', 'Sugar', 387, 0, 100, 0, ['spoon'], ['sugar', 'white sugar']),
  F('chocolate', 'Dark chocolate, 70%', 598, 7.8, 45.9, 42.6, ['slice'], ['chocolate', 'dark chocolate', 'chocolate bar']),
  F('coffee', 'Coffee, black', 1, 0.1, 0, 0, ['cup'], ['coffee', 'black coffee', 'espresso', 'americano']),

  /* ---- powders and prepared ---- */
  F('whey-protein', 'Protein powder, whey', 400, 80, 8, 6, ['spoon'], ['protein powder', 'whey', 'whey protein', 'protein shake']),
  F('pea-protein', 'Protein powder, pea', 390, 78, 10, 5, ['spoon'], ['pea protein', 'vegan protein']),
  F('granola', 'Granola', 471, 10, 64, 20, ['cup'], ['granola', 'muesli']),
  F('pizza', 'Pizza, cheese', 266, 11.4, 33.0, 9.7, ['piece'], ['pizza', 'pizza slice']),
  F('fries', 'Fries', 312, 3.4, 41.4, 15.0, ['cup'], ['fries', 'chips', 'french fries']),
  F('burger', 'Burger, beef', 254, 14.5, 20.0, 14.0, ['piece'], ['burger', 'beef burger', 'hamburger']),
])

const strip = s => String(s || '').toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // accents: "jalapeno" finds "jalapeño"

/**
 * Foods matching `q`, best first. An alias hit is how you find "walnut" for "Walnuts,
 * English"; a prefix beats a word that merely starts with the same letters, because
 * typing "to" should surface tofu, not tomato.
 */
export function searchFoods(q, limit = 8) {
  const needle = strip(q).trim()
  if (!needle) return []
  const scored = []
  for (const food of FOODS) {
    let score = 0
    for (const alias of food.alias) {
      const a = strip(alias)
      if (a === needle) { score = Math.max(score, 100); continue }
      if (a.startsWith(needle)) score = Math.max(score, 80 - Math.min(20, a.length - needle.length))
      else if (a.includes(needle)) score = Math.max(score, 50 - Math.min(20, a.length - needle.length))
    }
    if (score) scored.push({ food, score })
  }
  // Ties keep the table's own order, so a stable list does not shuffle as you type.
  return scored
    .sort((a, b) => b.score - a.score || FOODS.indexOf(a.food) - FOODS.indexOf(b.food))
    .slice(0, limit)
    .map(s => s.food)
}

/** The food with this id, or null. */
export const foodById = id => FOODS.find(f => f.id === id) || null

/** How many grams one of this food's portions is. Null when it does not offer it. */
export const portionGrams = (food, portion) => {
  if (!food || !PORTIONS[portion] || !food.portions.includes(portion)) return null
  return PORTIONS[portion].g
}

/**
 * The macros for `grams` of `food`, rounded to what a person would actually write down.
 *
 * Weighting the per-100 g figure beats storing portions with their own numbers: one value
 * per food is one value to get right, and a "cup of oats" derived from oats stays honest
 * when the per-100 g figure is corrected later.
 */
export function macrosFor(food, grams) {
  const g = Math.max(0, Number(grams) || 0)
  const k = g / 100
  const r = n => Math.round(n * k)
  return {
    kcal: r(food.kcal),
    p: r(food.p),
    c: r(food.c),
    f: r(food.f),
    grams: Math.round(g),
  }
}

/** "Walnuts, 30 g" - what a logged entry is called once it came from the table. */
export function foodLabel(food, grams) {
  return `${food.name}, ${Math.round(Number(grams) || 0)} g`
}