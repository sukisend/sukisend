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
      { city: 'Caloocan', barangays: ['Bagong Barrio', 'Camarin', 'Grace Park', 'Maypajo', 'Sangandaan', 'Tala', 'Amparo', 'Bagumbong'] },
      { city: 'Las Piñas', barangays: ['Almanza Uno', 'Almanza Dos', 'BF International', 'CAA', 'Pamplona Uno', 'Pamplona Dos', 'Talon Uno', 'Talon Dos'] },
      { city: 'Makati', barangays: ['Bangkal', 'Bel-Air', 'Guadalupe Nuevo', 'Guadalupe Viejo', 'Magallanes', 'Olympia', 'Palanan', 'Poblacion', 'San Antonio', 'San Lorenzo', 'Urdaneta'] },
      { city: 'Malabon', barangays: ['Acacia', 'Baritan', 'Catmon', 'Concepcion', 'Dampalit', 'Longos', 'Potrero', 'San Agustin', 'Tonsuya'] },
      { city: 'Mandaluyong', barangays: ['Addition Hills', 'Bagong Silang', 'Highway Hills', 'Hulo', 'Mabini-J. Rizal', 'Plainview', 'Wack-Wack Greenhills'] },
      { city: 'Manila', barangays: ['Binondo', 'Ermita', 'Intramuros', 'Malate', 'Paco', 'Pandacan', 'Quiapo', 'Sampaloc', 'San Miguel', 'Santa Ana', 'Santa Cruz', 'Tondo'] },
      { city: 'Marikina', barangays: ['Barangka', 'Calumpang', 'Concepcion Uno', 'Fortune', 'Industrial Valley', 'Jesus dela Peña', 'Malanday', 'Nangka', 'Parang', 'Santa Elena', 'Santo Niño', 'Tumana'] },
      { city: 'Muntinlupa', barangays: ['Alabang', 'Bayanan', 'Buli', 'Cupang', 'New Alabang Village', 'Poblacion', 'Putatan', 'Sucat', 'Tunasan'] },
      { city: 'Navotas', barangays: ['Bagumbayan North', 'Bagumbayan South', 'Bangculasi', 'Navotas East', 'Navotas West', 'North Bay Boulevard North', 'Sipac-Almacen', 'Tangos'] },
      { city: 'Parañaque', barangays: ['Baclaran', 'BF Homes', 'Don Bosco', 'La Huerta', 'Merville', 'San Antonio', 'San Isidro', 'San Martin de Porres', 'Sucat', 'Tambo'] },
      { city: 'Pasay', barangays: ['Baclaran', 'Bay City', 'Cartimar', 'Malibay', 'Newport City', 'Pasay Rotonda', 'Tramo', 'Villamor'] },
      { city: 'Pasig', barangays: ['Bagong Ilog', 'Caniogan', 'Kapitolyo', 'Manggahan', 'Maybunga', 'Oranbo', 'Pinagbuhatan', 'Rosario', 'Sagad', 'San Antonio', 'San Joaquin', 'Santolan', 'Ugong'] },
      { city: 'Pateros', barangays: ['Aguho', 'Magtanggol', 'Martires del 96', 'Poblacion', 'San Pedro', 'San Roque', 'Santa Ana', 'Tabacalera'] },
      { city: 'Quezon City', barangays: ['Bagong Pag-asa', 'Batasan Hills', 'Commonwealth', 'Diliman', 'Fairview', 'Holy Spirit', 'Kamuning', 'Katipunan', 'Krus na Ligas', 'Novaliches', 'Project 6', 'Sikatuna Village', 'South Triangle', 'Tandang Sora', 'Teachers Village', 'UP Campus'] },
      { city: 'San Juan', barangays: ['Addition Hills', 'Balong-Bato', 'Corazon de Jesus', 'Ermitaño', 'Greenhills', 'Isabelita', 'Kabayanan', 'Little Baguio', 'Maytunas', 'Pasadena', 'Pedro Cruz', 'Rivera', 'Salapan', 'San Perfecto', 'Santa Lucia', 'Tibagan', 'West Crame'] },
      { city: 'Taguig', barangays: ['Bagumbayan', 'Bambang', 'Calzada-Tipas', 'Central Bicutan', 'Fort Bonifacio', 'Katuparan', 'Maharlika Village', 'North Signal Village', 'Pinagsama', 'Tanyag', 'Upper Bicutan', 'Western Bicutan'] },
      { city: 'Valenzuela', barangays: ['Arkong Bato', 'Balangkas', 'Canumay East', 'Canumay West', 'Karuhatan', 'Lingunan', 'Mabolo', 'Malinta', 'Mapulang Lupa', 'Marulas', 'Maysan', 'Paso de Blas', 'Punturin', 'Ugong'] },
    ],
  },
  {
    province: 'Bulacan',
    cities: [
      { city: 'Malolos', barangays: ['Bangkal', 'Dakila', 'Ligas', 'Longos', 'Look 1st', 'Pinagbakahan', 'San Agustin', 'Santo Cristo', 'Sumapang Bata', 'Tikay'] },
      { city: 'Meycauayan', barangays: ['Bagbaguin', 'Bahay Pare', 'Bancal', 'Calvario', 'Camalig', 'Hulo', 'Lawa', 'Libtong', 'Longos', 'Pantoc', 'Perez', 'Saluysoy', 'St. Francis'] },
      { city: 'San Jose del Monte', barangays: ['Citrus', 'Dulong Bayan', 'Fatima', 'Francisco Homes', 'Graceville', 'Gumaoc', 'Kaypian', 'Lawang Pari', 'Minuyan', 'Muzon', 'Paradahan', 'Poblacion', 'Sapang Palay', 'Tungkong Mangga'] },
      { city: 'Marilao', barangays: ['Abangan Norte', 'Abangan Sur', 'Ibayo', 'Lambakin', 'Lias', 'Loma de Gato', 'Nagbalon', 'Patag', 'Poblacion', 'Prenza', 'Santa Rosa'] },
      { city: 'Baliwag', barangays: ['Bagong Nayon', 'Calantipay', 'Catulinan', 'Hinukay', 'Makinabang', 'Pagala', 'Paitan', 'Pinagbarilan', 'Poblacion', 'Sabang', 'Taal', 'Tangos'] },
      { city: 'Bocaue', barangays: ['Antipona', 'Bagumbayan', 'Bambang', 'Batia', 'Bunlo', 'Caingin', 'Duhat', 'Lolomboy', 'Poblacion', 'Sulucan', 'Taal', 'Wakas'] },
      { city: 'Obando', barangays: ['Binuangan', 'Catanghalan', 'Hulo', 'Lawa', 'Paco', 'Pagaribay', 'Panghulo', 'Salambao', 'San Pascual'] },
      { city: 'Guiguinto', barangays: ['Ilang-Ilang', 'Malis', 'Panginay', 'Poblacion', 'Pritil', 'Santa Cruz', 'Santa Rita', 'Tabang', 'Tikay', 'Tuktukan'] },
    ],
  },
  {
    province: 'Cavite',
    cities: [
      { city: 'Bacoor', barangays: ['Alima', 'Habay', 'Ligas', 'Mabolo', 'Molino', 'Niog', 'Panapaan', 'Queens Row', 'Real', 'Salinas', 'San Nicolas', 'Talaba'] },
      { city: 'Cavite City', barangays: ['Barangay 1', 'Barangay 22', 'Barangay 36', 'Caridad', 'Dalahican', 'San Antonio', 'Santa Cruz', 'Sangley'] },
      { city: 'Dasmariñas', barangays: ['Burol', 'Datu Esmael', 'Fatima', 'Langkaan', 'Paliparan', 'Sabang', 'Salawag', 'Salitran', 'San Agustin', 'San Jose', 'San Simon', 'Zone'] },
      { city: 'General Trias', barangays: ['Alingaro', 'Arnaldo', 'Bacao', 'Biclatan', 'Dulong Bayan', 'Governor Ferrer', 'Javalera', 'Manggahan', 'Navarro', 'Pasong Camachile', 'Pinagtipunan', 'San Francisco', 'Santiago'] },
      { city: 'Imus', barangays: ['Alapan', 'Anabu', 'Bayan Luma', 'Buhay na Tubig', 'Malagasang', 'Medicion', 'Palico', 'Poblacion', 'Toclong', 'Tanzang Luma'] },
      { city: 'Silang', barangays: ['Adlas', 'Biga', 'Biluso', 'Carmen', 'Gentri', 'Inchican', 'Lucsuhin', 'Maguyam', 'Munting Ilog', 'Puting Kahoy', 'Tartaria', 'Tubuan'] },
      { city: 'Tagaytay', barangays: ['Asisan', 'Francisco', 'Iruhin', 'Kaybagal', 'Maharlika', 'Mendez Crossing', 'Patutong Malaki', 'Sambong', 'San Jose', 'Sungay', 'Tolentino'] },
      { city: 'Trece Martires', barangays: ['Aguado', 'Cabezas', 'De Ocampo', 'Hugo Perez', 'Lallana', 'Lapidario', 'Luciano', 'Osorio', 'Perez', 'San Agustin', 'Gregorio'] },
    ],
  },
  {
    province: 'Laguna',
    cities: [
      { city: 'Biñan', barangays: ['Bungahan', 'Canlalay', 'Cutcut', 'De La Paz', 'Langkiwa', 'Malaban', 'Platero', 'Poblacion', 'San Antonio', 'San Francisco', 'Santo Tomas', 'Zapote'] },
      { city: 'Calamba', barangays: ['Banadero', 'Banlic', 'Batino', 'Bucal', 'Canlubang', 'Halang', 'Lawa', 'Lecheria', 'Lingga', 'Maunong', 'Mayapa', 'Milagrosa', 'Paciano Rizal', 'Pansol', 'Parian', 'Real', 'Saimsim', 'Sampiruhan', 'Uwisan'] },
      { city: 'Cabuyao', barangays: ['Banay-Banay', 'Banlic', 'Bigaa', 'Butong', 'Marinig', 'Niugan', 'Pittland', 'Poblacion Uno', 'Poblacion Dos', 'Sala', 'San Isidro'] },
      { city: 'Los Baños', barangays: ['Baybayin', 'Bayog', 'Lalakay', 'Maahas', 'Malinta', 'Masili', 'Mayondon', 'Putho-Tuntungin', 'San Antonio', 'Tadlac', 'Timugan'] },
      { city: 'San Pablo', barangays: ['Atisan', 'Bagong Bayan', 'Concepcion', 'Del Remedio', 'Dolores', 'San Antonio', 'San Buenaventura', 'San Cristobal', 'San Gabriel', 'San Rafael', 'Santiago I', 'Santiago II'] },
      { city: 'San Pedro', barangays: ['Bagong Silang', 'Calendola', 'Cuyab', 'Estrella', 'Fatima', 'G.S.I.S.', 'Landayan', 'Langgam', 'Laram', 'Magsaysay', 'Nueva', 'Pacita', 'Poblacion', 'Rosario', 'San Antonio', 'San Roque', 'San Vicente', 'Santo Niño', 'Sampaguita Village', 'United Bayanihan', 'United Better Living'] },
      { city: 'Santa Rosa', barangays: ['Aplaya', 'Balibago', 'Caingin', 'Dila', 'Don Jose', 'Ibaba', 'Kanluran', 'Macabling', 'Malitlit', 'Malusak', 'Market Area', 'Pook', 'Pulong Santa Cruz', 'Santo Domingo', 'Sinalhan', 'Tagapo'] },
    ],
  },
  {
    province: 'Rizal',
    cities: [
      { city: 'Antipolo', barangays: ['Bagong Nayon', 'Beverly Hills', 'Calawis', 'Cupang', 'Dalig', 'Dela Paz', 'Inarawan', 'Mambugan', 'Mayamot', 'Muntingdilaw', 'San Isidro', 'San Jose', 'San Roque', 'Santa Cruz'] },
      { city: 'Cainta', barangays: ['San Andres', 'San Isidro', 'San Juan', 'San Roque', 'Santa Rosa', 'Santo Domingo', 'Santo Niño'] },
      { city: 'Taytay', barangays: ['Dolores', 'Muzon', 'San Isidro', 'San Juan', 'Santa Ana', 'Sta. Barbara'] },
      { city: 'Rodriguez (Montalban)', barangays: ['Balite', 'Burgos', 'Geronimo', 'Macabud', 'Manggahan', 'Mascap', 'Puray', 'San Isidro', 'San Jose', 'San Rafael'] },
      { city: 'Angono', barangays: ['Mahabang Parang', 'Poblacion Ibaba', 'San Isidro', 'San Pedro', 'San Roque', 'San Vicente', 'Santo Niño'] },
      { city: 'Binangonan', barangays: ['Batingan', 'Calumpang', 'Habagatan', 'Janosa', 'Libis', 'Lunsad', 'Mambog', 'Pantok', 'Pila', 'Tatala'] },
    ],
  },
  {
    province: 'Pampanga',
    cities: [
      { city: 'Angeles', barangays: ['Amsic', 'Balibago', 'Cutcut', 'Diamond Sub', 'Lourdes North West', 'Malabanias', 'Mining', 'Pampang', 'Pulung Maragul', 'Salapungan', 'Sto. Domingo'] },
      { city: 'San Fernando', barangays: ['Calulut', 'Del Carmen', 'Del Pilar', 'Dolores', 'Lara', 'Magliman', 'Maimpis', 'Quebiawan', 'San Isidro', 'Sindalan', 'Telabastagan'] },
      { city: 'Clark (Mabalacat)', barangays: ['Camachiles', 'Clark', 'Dau', 'Dolores', 'Mabiga', 'Poblacion', 'San Francisco', 'San Joaquin', 'Santa Ines', 'Santo Rosario', 'Tabun'] },
      { city: 'Guagua', barangays: ['Bancal', 'Jose Abad Santos', 'Plaza Burgos', 'Poblacion', 'San Agustin', 'San Antonio', 'San Isidro', 'San Juan', 'San Matias', 'San Nicolas', 'San Pablo', 'San Pedro', 'San Rafael', 'San Roque', 'Santa Filomena', 'Santa Ines', 'Santo Cristo'] },
    ],
  },
  {
    province: 'Batangas',
    cities: [
      { city: 'Batangas City', barangays: ['Alangilan', 'Balagtas', 'Bolbok', 'Cuta', 'Kumintang Ibaba', 'Kumintang Ilaya', 'Libjo', 'Pallocan', 'Poblacion', 'Sampaga', 'Santa Rita Aplaya', 'Tabangao'] },
      { city: 'Lipa', barangays: ['Balintawak', 'Calamias', 'Dagatan', 'Lodlod', 'Marawoy', 'Mataas na Lupa', 'Munting Pulo', 'Paningkaan', 'Sabang', 'San Carlos', 'San Celestino', 'San Sebastian', 'Tambo', 'Tinga'] },
      { city: 'Tanauan', barangays: ['Banjo East', 'Boot', 'Darasa', 'Gonzales', 'Hidalgo', 'Janopol', 'Luyos', 'Natatas', 'Pagaspas', 'Sambat', 'Talisay'] },
      { city: 'Nasugbu', barangays: ['Aga', 'Balaytigui', 'Bilaran', 'Bucana', 'Calayo', 'Cogunan', 'Kaylaway', 'Looc', 'Malapad na Bato', 'Natipuan', 'Pantalan', 'Poblacion', 'Wawa'] },
    ],
  },
  {
    province: 'Cebu',
    cities: [
      { city: 'Cebu City', barangays: ['Apas', 'Banilad', 'Basak San Nicolas', 'Busay', 'Capitol Site', 'Guadalupe', 'Kamputhaw', 'Labangon', 'Lahug', 'Mabolo', 'Pardo', 'San Antonio', 'Talamban', 'T. Padilla'] },
      { city: 'Lapu-Lapu', barangays: ['Agus', 'Buaya', 'Gun-ob', 'Ibo', 'Mactan', 'Maribago', 'Pajac', 'Pajo', 'Poblacion', 'Pusok', 'Suba-Basbas'] },
      { city: 'Mandaue', barangays: ['Banilad', 'Basak', 'Cabancalan', 'Canduman', 'Casili', 'Centro', 'Guizo', 'Ibabao-Estancia', 'Jagobiao', 'Labogon', 'Looc', 'Maguikay', 'Mantuyong', 'Opao', 'Paknaan', 'Subangdaku', 'Tabok', 'Tipolo', 'Umapad'] },
      { city: 'Talisay', barangays: ['Bulacao', 'Campo IV', 'Dumlog', 'Jaclupan', 'Lawaan', 'Linao', 'Maghaway', 'Manipis', 'Mohon', 'Poblacion', 'San Isidro', 'San Roque', 'Tabunok', 'Tangke'] },
      { city: 'Toledo', barangays: ['Awihao', 'Bato', 'Buanoy', 'Calongcalong', 'Cambang-ug', 'Camp 8', 'Carmen', 'Gen. Climaco', 'Ilihan', 'Juan Climaco', 'Lutopan', 'Poog', 'Poblacion', 'Sangi'] },
    ],
  },
  {
    province: 'Davao del Sur',
    cities: [
      { city: 'Davao City', barangays: ['Agdao', 'Bajada', 'Buhangin', 'Bunawan', 'Catalunan Grande', 'Catalunan Pequeño', 'Langub', 'Ma-a', 'Matina', 'Mintal', 'Pampanga', 'Sasa', 'Talomo', 'Tibungco', 'Toril', 'Tugbok'] },
      { city: 'Digos', barangays: ['Aplaya', 'Cogon', 'Dawis', 'Dulangan', 'Goma', 'Igpit', 'Kapatagan', 'Kiagot', 'Lungag', 'Matti', 'Poblacion', 'San Jose', 'San Miguel', 'Tres de Mayo', 'Zone 1', 'Zone 2', 'Zone 3'] },
    ],
  },
  {
    province: 'Davao del Norte',
    cities: [
      { city: 'Tagum', barangays: ['Apokon', 'Busaon', 'Canocotan', 'Cuambogan', 'La Filipina', 'Liboganon', 'Madaum', 'Magdum', 'Mankilam', 'New Balamban', 'Pagsabangan', 'Pandapan', 'Visayan Village'] },
      { city: 'Panabo', barangays: ['A.O. Floirendo', 'Buenavista', 'Cagangohan', 'Datu Abdul Dadia', 'Gredu', 'J.P. Laurel', 'Little Panay', 'Lower Panaga', 'Mabunao', 'New Malaga', 'New Pandan', 'New Visayas', 'Poblacion', 'Salvacion', 'Santo Niño', 'Southern Davao'] },
    ],
  },
  {
    province: 'Iloilo',
    cities: [
      { city: 'Iloilo City', barangays: ['Arevalo', 'Balabago', 'Bolilao', 'Buhang', 'Calaparan', 'Desamparados', 'Dungon', 'Jaro', 'La Paz', 'Lapuz', 'Leganes', 'Mandurriao', 'Molo', 'Our Lady of Lourdes', 'San Isidro', 'San Pedro', 'Santa Cruz', 'Tabuc Suba'] },
    ],
  },
  {
    province: 'Negros Occidental',
    cities: [
      { city: 'Bacolod', barangays: ['Alijis', 'Banago', 'Bata', 'Cabug', 'Estefania', 'Felisa', 'Granada', 'Handumanan', 'Mandalagan', 'Mansilingan', 'Montevista', 'Pahanocoy', 'Punta Taytay', 'Singcang-Airport', 'Sum-ag', 'Taculing', 'Tangub', 'Villamonte'] },
      { city: 'Silay', barangays: ['Bagtic', 'Balaring', 'E. Lopez', 'D. Lacson', 'Guimbalaon', 'Hawaiian', 'Lantad', 'Mambulac', 'Patag', 'Poblacion I', 'Rizal'] },
    ],
  },
  {
    province: 'Pangasinan',
    cities: [
      { city: 'Dagupan', barangays: ['Bacayao Norte', 'Bacayao Sur', 'Bolosan', 'Bonuan Boquig', 'Bonuan Gueset', 'Calmay', 'Carael', 'Lomboy', 'Lucao', 'Malued', 'Pantal', 'Poblacion Oeste', 'Pugaro', 'Salapingao', 'Salisay', 'Tambac', 'Tapuac', 'Tebeng'] },
      { city: 'San Carlos', barangays: ['Abanon', 'Agdao', 'Anando', 'Antipangol', 'Aponit', 'Bacnar', 'Balaya', 'Baldog', 'Balite Sur', 'Buenglat', 'Cacaritan', 'Cobol', 'Coliling', 'Cruz', 'Doyong', 'Palaris', 'Poblacion', 'Roxas Boulevard', 'Taloy'] },
      { city: 'Urdaneta', barangays: ['Anonas', 'Bactad East', 'Bayaoas', 'Bolaoen', 'Cabaruan', 'Cabuloan', 'Camanang', 'Camantiles', 'Casantaan', 'Catbangen', 'Cayambanan', 'Consolacion', 'Dilan-Paurido', 'Dr. Pedro Orata', 'Labit Proper', 'Mabanogbog', 'Maculating', 'Nancalobasaan', 'Nancamaliran East', 'Nancamaliran West', 'Nancayasan', 'Payas', 'Pinmaludpod', 'Poblacion', 'San Jose', 'San Vicente', 'Santa Lucia', 'Santo Domingo', 'Sugcong', 'Tipuso', 'Tulong'] },
    ],
  },
  {
    province: 'Zambales',
    cities: [
      { city: 'Olongapo', barangays: ['Barretto', 'East Bajac-Bajac', 'East Tapinac', 'Gordon Heights', 'Kalaklan', 'Mabayuan', 'New Cabalan', 'New Ilalim', 'New Kababae', 'Old Cabalan', 'Pag-asa', 'Santa Rita', 'West Bajac-Bajac', 'West Tapinac'] },
      { city: 'Subic', barangays: ['Asinan', 'Baraca-Camachile', 'Batiawan', 'Calapandayan', 'Cawag', 'Ilwas', 'Manggahan', 'Matain', 'Naugsol', 'Pamatawan', 'San Isidro', 'Santo Tomas', 'Wawandue'] },
    ],
  },
  {
    province: 'Tarlac',
    cities: [
      { city: 'Tarlac City', barangays: ['Amucao', 'Armenia', 'Asturias', 'Balanti', 'Bantog', 'Binauganan', 'Bora', 'Cut-Cut I', 'Cut-Cut II', 'Dalayap', 'Dela Paz', 'Ligtasan', 'Lourdes', 'Mabini', 'Maligaya', 'Mapalacsiao', 'Mapalad', 'Matatalaib', 'Paraiso', 'Poblacion', 'San Carlos', 'San Isidro', 'San Jose', 'San Manuel', 'San Miguel', 'San Nicolas', 'San Pascual', 'San Rafael', 'San Roque', 'San Sebastian', 'San Vicente', 'Santa Cruz', 'Santa Maria', 'Santo Cristo', 'Santo Domingo', 'Santo Niño', 'Sapang Maragul', 'Suizo', 'Tibag', 'Ungot'] },
    ],
  },
  {
    province: 'Nueva Ecija',
    cities: [
      { city: 'Cabanatuan', barangays: ['Aduas Centro', 'Aduas Norte', 'Aduas Sur', 'Bangad', 'Barrera', 'Caalibangbangan', 'Communal', 'Daang Sarile', 'Dicarma', 'Gen. Luna', 'Hermogenes Concepcion', 'Imelda', 'Isla', 'Magsaysay Norte', 'Magsaysay Sur', 'Mabini Homesite', 'Obrero', 'Pagas', 'Palagay', 'Pangkawayan', 'Poblacion', 'Sangitan', 'Sinipit Bubon', 'Sumacab Este', 'Sumacab Norte', 'Valley Crest', 'Villa Marina'] },
      { city: 'San Jose City', barangays: ['A. Pascual', 'Abar 2nd', 'Bagong Sikat', 'Caimito', 'Caanawan', 'Ferdinand', 'General Luna', 'Kita-Kita', 'Malasin', 'Manicla', 'Maragol', 'Palestina', 'Pinaagahan', 'Pinili', 'Rafael Rueda', 'San Agustin', 'San Juan', 'San Mauricio', 'Santa Cruz', 'Santo Tomas', 'Sibut', 'Tayabo', 'Villa Joson', 'Villa Marina'] },
    ],
  },
  {
    province: 'Benguet',
    cities: [
      { city: 'Baguio', barangays: ['A. Bonifacio-Caguioa-Rimando', 'Abanao-Zandueta-Kayong-Chugum-Otek', 'Alfonso Tabora', 'Ambiong', 'Andres Bonifacio', 'Aurora Hill', 'Bakakeng Central', 'Bakakeng Norte', 'BGH Compound', 'Burnham-Legarda-Kisad', 'Cabinet Hill-Teacher Camp', 'Camp 7', 'Camp 8', 'Campo Filipino', 'City Camp Central', 'City Camp Proper', 'Country Club Village', 'Dizon Subdivision', 'Dominican Hill-Mirador', 'DPS Area', 'Engineers Hill', 'Ferdinand', 'Forbes Park', 'General Emilio Aguinaldo', 'General Luna', 'Gibraltar', 'Greenwater Village', 'Happy Hollow', 'Harrison-Claudio Carantes', 'Hillside', 'Holy Ghost Extension', 'Holy Ghost Proper', 'Imelda', 'Irisan', 'Kabayanihan', 'Kagitingan', 'Kias', 'Legarda-Burnham-Kisad', 'Liwanag-Loakan', 'Loakan Proper', 'Lopez Jaena', 'Lucban', 'Lualhati', 'Magsaysay', 'Military Cut-Off', 'Mines View Park', 'Modern Site', 'MRR-Queen of Peace', 'New Lucban', 'Outlook Drive', 'Pacdal', 'Pucsusan', 'Rock Quarry', 'Saint Joseph Village', 'Salud Mitra', 'San Antonio Village', 'San Luis', 'San Roque Village', 'San Vicente', 'Santa Escolastica', 'Sanchez', 'Santo Rosario', 'Scout Barrio', 'Session Road Area', 'SLU-SVP', 'Teodora Alonzo', 'Trancoville', 'Upper General Luna'] },
      { city: 'La Trinidad', barangays: ['Alapang', 'Alno', 'Ambiong', 'Bahong', 'Balili', 'Beckel', 'Betag', 'Bineng', 'Cruz', 'Lubas', 'Pico', 'Poblacion', 'Puguis', 'Shilan', 'Tawang', 'Wangal'] },
    ],
  },
  {
    province: 'Isabela',
    cities: [
      { city: 'Cauayan', barangays: ['Alinam', 'Almaguer Norte', 'Almaguer Sur', 'Cabaruan', 'District I', 'District II', 'District III', 'Libertad', 'Magassi', 'Minante I', 'Minante II', 'Pinoma', 'Samon', 'San Fermin', 'Tagaran', 'Villafuerte'] },
      { city: 'Santiago', barangays: ['Abra', 'Batal', 'Calao', 'Cabulay', 'Dubinan East', 'Dubinan West', 'Esperanza', 'Malvar', 'Patul', 'Plaridel', 'Rizal', 'Rosario', 'Sagana', 'Salvador', 'San Andres', 'San Isidro', 'Sinili', 'Victory Norte', 'Victory Sur', 'Villasis'] },
    ],
  },
  {
    province: 'Cagayan',
    cities: [
      { city: 'Tuguegarao', barangays: ['Annafunan East', 'Annafunan West', 'Atulayan Norte', 'Atulayan Sur', 'Bagay', 'Buntun', 'Caggay', 'Capatan', 'Caritan Centro', 'Caritan Norte', 'Caritan Sur', 'Carig', 'Centro', 'Dadda', 'Gosi Norte', 'Gosi Sur', 'Larion Alto', 'Larion Bajo', 'Libag Norte', 'Libag Sur', 'Linao Norte', 'Linao East', 'Nambbalan Norte', 'Pallua Norte', 'Pallua Sur', 'Pengue-Ruyu', 'Reyes', 'San Gabriel', 'Tagga', 'Tanza', 'Ugac Norte', 'Ugac Sur'] },
    ],
  },
  {
    province: 'Leyte',
    cities: [
      { city: 'Tacloban', barangays: ['Abucay', 'Anibong', 'Bagacay', 'Cabalawan', 'Caibaan', 'Calanipawan', 'Diit', 'Fatima Village', 'Magallanes', 'Nula-Tula', 'Poblacion', 'Sagkahan', 'San Jose', 'Santo Niño', 'Suhi', 'Tigbao', 'Utap', 'V&G Subd'] },
      { city: 'Ormoc', barangays: ['Bagong', 'Bayog', 'Biliboy', 'Cagbuhangin', 'Camp Downes', 'Can-adieng', 'Catmon', 'Cogon', 'Curva', 'Danhug', 'Ipil', 'Liloan', 'Linao', 'Macabug', 'Mabini', 'Naungan', 'Punta', 'Rufina Tan', 'San Pablo', 'Tambulilid'] },
    ],
  },
  {
    province: 'Zamboanga del Sur',
    cities: [
      { city: 'Zamboanga City', barangays: ['Arena Blanco', 'Ayala', 'Baliwasan', 'Camino Nuevo', 'Campo Islam', 'Canelar', 'Curuan', 'Divisoria', 'Guiwan', 'La Paz', 'Labuan', 'Lanzones', 'Lunzuran', 'Maasin', 'Mercedes', 'Pasonanca', 'Putik', 'Recodo', 'Rio Hondo', 'San Jose Cawa-Cawa', 'San Jose Gusu', 'San Roque', 'Santa Catalina', 'Santa Maria', 'Santo Niño', 'Sinunuc', 'Sta. Barbara', 'Tetuan', 'Talisayan', 'Tumaga', 'Zambowood'] },
    ],
  },
  {
    province: 'Misamis Oriental',
    cities: [
      { city: 'Cagayan de Oro', barangays: ['Agusan', 'Baikingon', 'Balulang', 'Bonbon', 'Bugo', 'Bulua', 'Camaman-an', 'Canitoan', 'Carmen', 'Consolacion', 'Cugman', 'Gusa', 'Iponan', 'Kauswagan', 'Lapasan', 'Macabalan', 'Macasandig', 'Nazareth', 'Puntod', 'Puerto', 'Tablon', 'Tignapoloan', 'Tuburan'] },
    ],
  },
  {
    province: 'South Cotabato',
    cities: [
      { city: 'General Santos', barangays: ['Apopong', 'Baluan', 'Batomelong', 'Buayan', 'Calumpang', 'City Heights', 'Conel', 'Dadiangas East', 'Dadiangas North', 'Dadiangas South', 'Dadiangas West', 'Fatima', 'Katangawan', 'Labangal', 'Lagao', 'Mabuhay', 'San Isidro', 'Siguel', 'Tambler', 'Tinagacan', 'Upper Labay'] },
    ],
  },
  {
    province: 'Bukidnon',
    cities: [
      { city: 'Malaybalay', barangays: ['Aglayan', 'Bangcud', 'Busdi', 'Casisang', 'Dalwangan', 'Kalasungay', 'Laguitas', 'Linabo', 'Patpat', 'Poblacion', 'San Fernando', 'San Jose', 'Sumpong', 'Violeta'] },
      { city: 'Valencia', barangays: ['Bagontaas', 'Batangan', 'Colonia', 'Hagkol', 'Lumbayao', 'Lumbo', 'Mailag', 'Mt. Pleasant', 'Poblacion', 'San Carlos', 'Sinabuagan', 'Tongantongan'] },
    ],
  },
  {
    province: 'Albay',
    cities: [
      { city: 'Legazpi', barangays: ['Bariis', 'Bigaa', 'Bonot', 'Busay', 'Cabagñan', 'Cruzada', 'Dap-dap', 'Gogon', 'Homapon', 'Ilawod', 'Kapantawan', 'Lamba', 'Maoyod', 'Pawa', 'Rawis', 'Taysan', 'Victory Village'] },
      { city: 'Tabaco', barangays: ['Agnas', 'Basud', 'Buang', 'Buhian', 'Cabangan', 'Comun', 'Imao', 'Magapo', 'Maonon', 'Poblacion', 'San Antonio', 'San Isidro', 'San Lorenzo', 'San Ramon', 'San Roque', 'San Vicente', 'Tao'] },
    ],
  },
  {
    province: 'Camarines Sur',
    cities: [
      { city: 'Naga', barangays: ['Abella', 'Bagumbayan Norte', 'Bagumbayan Sur', 'Balatas', 'Calauag', 'Cararayan', 'Carolina', 'Concepcion Grande', 'Concepcion Pequeña', 'Dayangdang', 'Del Rosario', 'Dinaga', 'Igualdad Interior', 'Lerma', 'Liboton', 'Mabolo', 'Pacol', 'Panicuason', 'Peñafrancia', 'Sabang', 'San Felipe', 'San Francisco', 'Santa Cruz', 'Tabuco', 'Tinago', 'Triangulo'] },
    ],
  },
  {
    province: 'Palawan',
    cities: [
      { city: 'Puerto Princesa', barangays: ['Babuyan', 'Bacungan', 'Bagong Silang', 'Bancao-Bancao', 'Binduyan', 'Cabayugan', 'Concepcion', 'Inagawan', 'Irawan', 'Iwahig', 'Langogan', 'Lucbuan', 'Luzviminda', 'Mandaragat', 'Mangingisda', 'Maningning', 'Manalo', 'Masipag', 'Matahimik', 'Model', 'Napsan', 'New Panggangan', 'Pagkakaisa', 'Princesa', 'Salvacion', 'San Jose', 'San Manuel', 'San Miguel', 'San Pedro', 'San Rafael', 'Sicsican', 'Simpocan', 'Sta. Cruz', 'Sta. Lourdes', 'Sta. Lucia', 'Sta. Monica', 'Tagburos', 'Tagumpay', 'Tanabag', 'Tiniguiban'] },
    ],
  },
];
