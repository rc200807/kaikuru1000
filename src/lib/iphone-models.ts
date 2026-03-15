export type IPhoneSeries = {
  series: string
  models: {
    model: string
    storages: string[]
  }[]
}

export const IPHONE_SERIES: IPhoneSeries[] = [
  {
    series: 'iPhone 16',
    models: [
      { model: 'iPhone 16', storages: ['128GB', '256GB', '512GB'] },
      { model: 'iPhone 16 Plus', storages: ['128GB', '256GB', '512GB'] },
      { model: 'iPhone 16 Pro', storages: ['128GB', '256GB', '512GB', '1TB'] },
      { model: 'iPhone 16 Pro Max', storages: ['256GB', '512GB', '1TB'] },
    ],
  },
  {
    series: 'iPhone 15',
    models: [
      { model: 'iPhone 15', storages: ['128GB', '256GB', '512GB'] },
      { model: 'iPhone 15 Plus', storages: ['128GB', '256GB', '512GB'] },
      { model: 'iPhone 15 Pro', storages: ['128GB', '256GB', '512GB', '1TB'] },
      { model: 'iPhone 15 Pro Max', storages: ['256GB', '512GB', '1TB'] },
    ],
  },
  {
    series: 'iPhone 14',
    models: [
      { model: 'iPhone 14', storages: ['128GB', '256GB', '512GB'] },
      { model: 'iPhone 14 Plus', storages: ['128GB', '256GB', '512GB'] },
      { model: 'iPhone 14 Pro', storages: ['128GB', '256GB', '512GB', '1TB'] },
      { model: 'iPhone 14 Pro Max', storages: ['128GB', '256GB', '512GB', '1TB'] },
    ],
  },
  {
    series: 'iPhone 13',
    models: [
      { model: 'iPhone 13 mini', storages: ['128GB', '256GB', '512GB'] },
      { model: 'iPhone 13', storages: ['128GB', '256GB', '512GB'] },
      { model: 'iPhone 13 Pro', storages: ['128GB', '256GB', '512GB', '1TB'] },
      { model: 'iPhone 13 Pro Max', storages: ['128GB', '256GB', '512GB', '1TB'] },
    ],
  },
  {
    series: 'iPhone SE / 12',
    models: [
      { model: 'iPhone SE (第3世代)', storages: ['64GB', '128GB', '256GB'] },
      { model: 'iPhone 12 mini', storages: ['64GB', '128GB', '256GB'] },
      { model: 'iPhone 12', storages: ['64GB', '128GB', '256GB'] },
      { model: 'iPhone 12 Pro', storages: ['128GB', '256GB', '512GB'] },
      { model: 'iPhone 12 Pro Max', storages: ['128GB', '256GB', '512GB'] },
    ],
  },
  {
    series: 'iPhone 11 / SE2',
    models: [
      { model: 'iPhone SE (第2世代)', storages: ['64GB', '128GB', '256GB'] },
      { model: 'iPhone 11', storages: ['64GB', '128GB', '256GB'] },
      { model: 'iPhone 11 Pro', storages: ['64GB', '256GB', '512GB'] },
      { model: 'iPhone 11 Pro Max', storages: ['64GB', '256GB', '512GB'] },
    ],
  },
  {
    series: 'iPhone XS / XR',
    models: [
      { model: 'iPhone XR', storages: ['64GB', '128GB', '256GB'] },
      { model: 'iPhone XS', storages: ['64GB', '256GB', '512GB'] },
      { model: 'iPhone XS Max', storages: ['64GB', '256GB', '512GB'] },
    ],
  },
  {
    series: 'iPhone X / 8',
    models: [
      { model: 'iPhone X', storages: ['64GB', '256GB'] },
      { model: 'iPhone 8', storages: ['64GB', '128GB', '256GB'] },
      { model: 'iPhone 8 Plus', storages: ['64GB', '128GB', '256GB'] },
    ],
  },
  {
    series: 'iPhone 7 / SE1',
    models: [
      { model: 'iPhone SE (第1世代)', storages: ['16GB', '32GB', '64GB', '128GB'] },
      { model: 'iPhone 7', storages: ['32GB', '128GB', '256GB'] },
      { model: 'iPhone 7 Plus', storages: ['32GB', '128GB', '256GB'] },
    ],
  },
  {
    series: 'iPhone 6s / 6',
    models: [
      { model: 'iPhone 6', storages: ['16GB', '64GB', '128GB'] },
      { model: 'iPhone 6 Plus', storages: ['16GB', '64GB', '128GB'] },
      { model: 'iPhone 6s', storages: ['16GB', '32GB', '64GB', '128GB'] },
      { model: 'iPhone 6s Plus', storages: ['16GB', '32GB', '64GB', '128GB'] },
    ],
  },
  {
    series: '〜iPhone 5s',
    models: [
      { model: 'iPhone 5s', storages: ['16GB', '32GB', '64GB'] },
      { model: 'iPhone 5c', storages: ['8GB', '16GB', '32GB'] },
      { model: 'iPhone 5', storages: ['16GB', '32GB', '64GB'] },
      { model: 'iPhone 4S', storages: ['8GB', '16GB', '32GB', '64GB'] },
      { model: 'iPhone 4', storages: ['8GB', '16GB', '32GB'] },
      { model: 'iPhone 3GS', storages: ['8GB', '16GB', '32GB'] },
      { model: 'iPhone 3G', storages: ['8GB', '16GB'] },
      { model: 'iPhone (初代)', storages: ['4GB', '8GB', '16GB'] },
    ],
  },
]

export const ALL_IPHONE_MODELS = IPHONE_SERIES.flatMap(s => s.models)
