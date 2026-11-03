const USDA_SOURCE = 'USDA FoodData Central · SR Legacy'

const baseFoods = [
  { id: 'usda-avocado', name: 'Aguacate, crudo', portion: '100 g', calories: 160, protein: 2, carbs: 8.53, fat: 14.66, sodium: 7, calcium: 12, iron: 0.55, category: 'Frutas y verduras', source: USDA_SOURCE },
  { id: 'usda-banana', name: 'Plátano, crudo', portion: '100 g', calories: 89, protein: 1.09, carbs: 22.84, fat: 0.33, sodium: 1, calcium: 5, iron: 0.26, category: 'Frutas y verduras', source: USDA_SOURCE },
  { id: 'usda-apple', name: 'Manzana con cáscara, cruda', portion: '100 g', calories: 52, protein: 0.26, carbs: 13.81, fat: 0.17, sodium: 1, calcium: 6, iron: 0.12, category: 'Frutas y verduras', source: USDA_SOURCE },
  { id: 'usda-orange', name: 'Naranja, cruda', portion: '100 g', calories: 47, protein: 0.94, carbs: 11.75, fat: 0.12, sodium: 0, calcium: 40, iron: 0.1, category: 'Frutas y verduras', source: USDA_SOURCE },
  { id: 'usda-tomato', name: 'Jitomate, crudo', portion: '100 g', calories: 18, protein: 0.88, carbs: 3.89, fat: 0.2, sodium: 5, calcium: 10, iron: 0.27, category: 'Frutas y verduras', source: USDA_SOURCE },
  { id: 'usda-spinach', name: 'Espinaca, cruda', portion: '100 g', calories: 23, protein: 2.86, carbs: 3.63, fat: 0.39, sodium: 79, calcium: 99, iron: 2.71, category: 'Frutas y verduras', source: USDA_SOURCE },
  { id: 'usda-broccoli', name: 'Brócoli, crudo', portion: '100 g', calories: 34, protein: 2.82, carbs: 6.64, fat: 0.37, sodium: 33, calcium: 47, iron: 0.73, category: 'Frutas y verduras', source: USDA_SOURCE },
  { id: 'usda-carrot', name: 'Zanahoria, cruda', portion: '100 g', calories: 41, protein: 0.93, carbs: 9.58, fat: 0.24, sodium: 69, calcium: 33, iron: 0.3, category: 'Frutas y verduras', source: USDA_SOURCE },
  { id: 'usda-oats', name: 'Avena, seca', portion: '100 g', calories: 389, protein: 16.89, carbs: 66.27, fat: 6.9, sodium: 2, calcium: 54, iron: 4.72, category: 'Cereales', source: USDA_SOURCE },
  { id: 'usda-brown-rice', name: 'Arroz integral, cocido', portion: '100 g', calories: 123, protein: 2.74, carbs: 25.58, fat: 0.97, sodium: 4, calcium: 3, iron: 0.56, category: 'Cereales', source: USDA_SOURCE },
  { id: 'usda-corn-tortilla', name: 'Tortilla de maíz', portion: '100 g', calories: 218, protein: 5.7, carbs: 44.6, fat: 2.85, sodium: 45, calcium: 81, iron: 1.23, category: 'Cereales', source: USDA_SOURCE },
  { id: 'usda-quinoa', name: 'Quinoa, cocida', portion: '100 g', calories: 120, protein: 4.4, carbs: 21.3, fat: 1.92, sodium: 7, calcium: 17, iron: 1.49, category: 'Cereales', source: USDA_SOURCE },
  { id: 'usda-black-beans', name: 'Frijoles negros, cocidos sin sal', portion: '100 g', calories: 132, protein: 8.86, carbs: 23.71, fat: 0.54, sodium: 1, calcium: 27, iron: 2.1, category: 'Cereales', source: USDA_SOURCE },
  { id: 'usda-lentils', name: 'Lentejas, cocidas sin sal', portion: '100 g', calories: 116, protein: 9.02, carbs: 20.13, fat: 0.38, sodium: 2, calcium: 19, iron: 3.33, category: 'Cereales', source: USDA_SOURCE },
  { id: 'usda-chicken', name: 'Pechuga de pollo, asada', portion: '100 g', calories: 165, protein: 31.02, carbs: 0, fat: 3.57, sodium: 74, calcium: 15, iron: 1.04, category: 'Proteínas', source: USDA_SOURCE },
  { id: 'usda-salmon', name: 'Salmón del Atlántico, cocido', portion: '100 g', calories: 206, protein: 22.1, carbs: 0, fat: 12.35, sodium: 61, calcium: 15, iron: 0.34, category: 'Proteínas', source: USDA_SOURCE },
  { id: 'usda-egg', name: 'Huevo entero, cocido', portion: '100 g', calories: 155, protein: 12.58, carbs: 1.12, fat: 10.61, sodium: 124, calcium: 50, iron: 1.19, category: 'Proteínas', source: USDA_SOURCE },
  { id: 'usda-yogurt', name: 'Yogur estilo griego, natural descremado', portion: '100 g', calories: 59, protein: 10.19, carbs: 3.6, fat: 0.39, sodium: 36, calcium: 110, iron: 0.07, category: 'Lácteos', source: USDA_SOURCE },
  { id: 'usda-milk', name: 'Leche, 2% grasa', portion: '100 g', calories: 50, protein: 3.3, carbs: 4.8, fat: 1.98, sodium: 44, calcium: 120, iron: 0.02, category: 'Lácteos', source: USDA_SOURCE },
  { id: 'usda-almonds', name: 'Almendras, crudas', portion: '100 g', calories: 579, protein: 21.15, carbs: 21.55, fat: 49.93, sodium: 1, calcium: 269, iron: 3.71, category: 'Grasas', source: USDA_SOURCE },
  { id: 'usda-olive-oil', name: 'Aceite de oliva', portion: '100 g', calories: 884, protein: 0, carbs: 0, fat: 100, sodium: 2, calcium: 1, iron: 0.56, category: 'Grasas', source: USDA_SOURCE },
]

export function mergeFoodCatalog(savedFoods = []) {
  const saved = Array.isArray(savedFoods) ? savedFoods.filter((food) => food && typeof food === 'object') : []
  const consumed = new Set()
  const foods = baseFoods.map((baseFood) => {
    const savedIndex = saved.findIndex((food) => food.id === baseFood.id)
    if (savedIndex >= 0) {
      consumed.add(savedIndex)
      return { ...baseFood, ...saved[savedIndex] }
    }
    const nameIndex = saved.findIndex((food, index) => !consumed.has(index) && String(food.name || '').trim().toLocaleLowerCase() === baseFood.name.toLocaleLowerCase())
    if (nameIndex >= 0) {
      consumed.add(nameIndex)
      return { ...saved[nameIndex], source: saved[nameIndex].source || 'Dato ingresado manualmente' }
    }
    return baseFood
  })
  return [...foods, ...saved.filter((_, index) => !consumed.has(index))]
}

export const initialMenuTemplates = [
  {
    id: 'sample-balanced',
    name: 'Menú casero equilibrado',
    description: 'Ejemplo general con cinco tiempos de comida.',
    menu: [
      { time: 'Desayuno', hour: '7:30 am', title: 'Avena con yogur y plátano', items: ['Avena cocida', 'Yogur natural', 'Plátano en rodajas'], calories: 420, protein: 21, carbs: 68, fat: 8, department: 'Lácteos' },
      { time: 'Colación', hour: '10:30 am', title: 'Manzana con almendras', items: ['1 manzana', 'Almendras'], calories: 210, protein: 5, carbs: 29, fat: 10, department: 'Frutas y verduras' },
      { time: 'Comida', hour: '2:00 pm', title: 'Pollo con arroz integral y ensalada', items: ['Pechuga de pollo asada', 'Arroz integral', 'Jitomate y espinaca', 'Aguacate'], calories: 585, protein: 44, carbs: 63, fat: 15, department: 'Carnes y proteínas' },
      { time: 'Colación', hour: '5:00 pm', title: 'Yogur con fruta', items: ['Yogur natural', 'Fruta de temporada'], calories: 160, protein: 12, carbs: 20, fat: 3, department: 'Lácteos' },
      { time: 'Cena', hour: '8:00 pm', title: 'Salmón con verduras y tortilla', items: ['Salmón al horno', 'Brócoli', 'Tortilla de maíz'], calories: 425, protein: 29, carbs: 39, fat: 14, department: 'Carnes y proteínas' },
    ],
  },
  {
    id: 'sample-vegetarian',
    name: 'Menú vegetariano',
    description: 'Ejemplo sin carne ni pescado; personaliza porciones y productos.',
    menu: [
      { time: 'Desayuno', hour: '8:00 am', title: 'Avena con fruta y semillas', items: ['Avena cocida', 'Plátano', 'Semillas'], calories: 400, protein: 16, carbs: 58, fat: 12, department: 'Cereales' },
      { time: 'Colación', hour: '11:00 am', title: 'Naranja con almendras', items: ['1 naranja', 'Almendras'], calories: 190, protein: 6, carbs: 25, fat: 9, department: 'Frutas y verduras' },
      { time: 'Comida', hour: '2:00 pm', title: 'Lentejas con quinoa y verduras', items: ['Lentejas cocidas', 'Quinoa', 'Jitomate y espinaca'], calories: 560, protein: 26, carbs: 80, fat: 14, department: 'Cereales' },
      { time: 'Colación', hour: '5:00 pm', title: 'Manzana con crema de cacahuate', items: ['1 manzana', 'Crema de cacahuate'], calories: 190, protein: 5, carbs: 29, fat: 9, department: 'Frutas y verduras' },
      { time: 'Cena', hour: '8:00 pm', title: 'Tacos de frijol y aguacate', items: ['Frijoles negros', 'Tortillas de maíz', 'Aguacate', 'Jitomate'], calories: 410, protein: 18, carbs: 56, fat: 11, department: 'Cereales' },
    ],
  },
  {
    id: 'sample-mexican',
    name: 'Menú con alimentos cotidianos',
    description: 'Ejemplo con ingredientes comunes; requiere adaptación individual.',
    menu: [
      { time: 'Desayuno', hour: '7:30 am', title: 'Huevo con jitomate y tortillas', items: ['Huevo', 'Jitomate', 'Tortillas de maíz'], calories: 390, protein: 22, carbs: 42, fat: 14, department: 'Cereales' },
      { time: 'Colación', hour: '10:30 am', title: 'Yogur con plátano', items: ['Yogur natural', 'Plátano'], calories: 180, protein: 12, carbs: 31, fat: 1, department: 'Lácteos' },
      { time: 'Comida', hour: '2:00 pm', title: 'Pollo con frijoles y verduras', items: ['Pechuga de pollo', 'Frijoles', 'Tortillas de maíz', 'Ensalada de verduras'], calories: 620, protein: 45, carbs: 74, fat: 14, department: 'Carnes y proteínas' },
      { time: 'Colación', hour: '5:00 pm', title: 'Zanahoria con hummus', items: ['Zanahoria', 'Hummus'], calories: 170, protein: 6, carbs: 22, fat: 8, department: 'Frutas y verduras' },
      { time: 'Cena', hour: '8:00 pm', title: 'Salmón con camote y espinaca', items: ['Salmón', 'Camote', 'Espinaca'], calories: 440, protein: 29, carbs: 48, fat: 13, department: 'Carnes y proteínas' },
    ],
  },
]

export function createEmptyPatient(id = null) {
  const weeklyMenu = {
    monday: [],
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: [],
    saturday: [],
    sunday: [],
  }
  return {
    id,
    name: '',
    age: '',
    sex: 'Mujer',
    email: '',
    phone: '',
    status: 'Activo',
    goal: '',
    reason: '',
    history: '',
    allergies: '',
    dislikes: '',
    height: '',
    weight: '',
    measurements: [],
    targets: { calories: 1800, protein: 110, carbs: 210, fat: 60 },
    weeklyMenu,
    recommendations: [],
    notes: [],
    checklist: {},
    shoppingChecked: {},
  }
}

export const initialData = {
  professional: {
    name: '',
    license: '',
    officeName: '',
    tagline: '',
    phone: '',
    email: '',
    social: '',
    address: '',
    logo: '',
    color: '#347c62',
  },
  activePatientId: null,
  patients: [],
  betaPatientRegistrations: 0,
  appointments: [],
  foods: baseFoods,
}

export const navItems = [
  { id: 'overview', label: 'Resumen', icon: 'LayoutDashboard' },
  { id: 'patients', label: 'Pacientes', icon: 'UsersRound' },
  { id: 'plans', label: 'Planes nutricionales', icon: 'NotebookTabs' },
  { id: 'foods', label: 'Alimentos', icon: 'Apple' },
]
