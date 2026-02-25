export interface BarangayCityMap {
  city: string;
  barangays: string[];
}

export interface ProvinceMap {
  province: string;
  cities: BarangayCityMap[];
}

export const PH_LOCATION_MAP: ProvinceMap[] = [
  {
    province: 'Metro Manila',
    cities: [
      {
        city: 'Quezon City',
        barangays: ['Commonwealth', 'Batasan Hills', 'Novaliches', 'Tandang Sora'],
      },
      {
        city: 'Manila',
        barangays: ['Ermita', 'Malate', 'Sampaloc', 'Tondo'],
      },
      {
        city: 'Makati',
        barangays: ['Poblacion', 'Bel-Air', 'San Lorenzo', 'Urdaneta'],
      },
    ],
  },
  {
    province: 'Cebu',
    cities: [
      {
        city: 'Cebu City',
        barangays: ['Lahug', 'Mabolo', 'Banilad', 'Talamban'],
      },
      {
        city: 'Mandaue',
        barangays: ['Canduman', 'Banilad', 'Basak', 'Centro'],
      },
      {
        city: 'Lapu-Lapu',
        barangays: ['Pusok', 'Maribago', 'Pajac', 'Poblacion'],
      },
    ],
  },
  {
    province: 'Laguna',
    cities: [
      {
        city: 'Calamba',
        barangays: ['Real', 'Canlubang', 'Paciano Rizal', 'Banadero'],
      },
      {
        city: 'Santa Rosa',
        barangays: ['Balibago', 'Don Jose', 'Santo Domingo', 'Tagapo'],
      },
    ],
  },
  {
    province: 'Davao del Sur',
    cities: [
      {
        city: 'Davao City',
        barangays: ['Buhangin', 'Matina', 'Bunawan', 'Talomo'],
      },
    ],
  },
];
