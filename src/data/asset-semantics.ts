/** Vocabulary annotates existing manifest IDs; it never supplies artwork. */
export interface AssetVocabulary {
  id: string;
  shadowId: string;
  aliases: string[];
  shadowAliases: string[];
}

export const ASSET_VOCABULARY: AssetVocabulary[] = [
  {
    id: 'book', shadowId: 'book-silhouette',
    aliases: ['book', 'books', 'open book', 'книга', 'книгу', 'книги', 'книжка', 'книжку', 'учебник', 'открытая книга', 'открытую книгу', 'раскрытая книга'],
    shadowAliases: ['book shadow', 'shadow book', 'book silhouette', 'background book', 'тень книги', 'силуэт книги', 'фоновая книга', 'книга тень'],
  },
  {
    id: 'phone', shadowId: 'phone-silhouette',
    aliases: ['phone', 'phones', 'smartphone', 'smartphones', 'mobile phone', 'cell phone', 'телефон', 'телефоны', 'смартфон', 'смартфоны', 'мобильный телефон', 'мобильник', 'айфон'],
    shadowAliases: ['phone shadow', 'shadow phone', 'phone silhouette', 'background phone', 'тень телефона', 'силуэт телефона', 'фоновый телефон'],
  },
  {
    id: 'puzzle-pieces', shadowId: 'puzzle-silhouette',
    aliases: ['puzzle', 'puzzles', 'puzzle pieces', 'puzzle piece', 'jigsaw', 'jigsaw pieces', 'пазл', 'пазлы', 'пазлы вместе', 'кусочки пазла', 'детали пазла', 'головоломка'],
    shadowAliases: ['puzzle shadow', 'shadow puzzle', 'puzzle silhouette', 'background puzzle', 'тень пазла', 'тень пазлов', 'силуэт пазла', 'фоновые пазлы'],
  },
  {
    id: 'compact-disc', shadowId: 'disc-silhouette',
    aliases: ['disc', 'discs', 'disk', 'compact disc', 'compact disk', 'cd', 'cd disc', 'диск', 'диски', 'компакт диск', 'компакт-диск', 'музыкальный диск'],
    shadowAliases: ['disc shadow', 'shadow disc', 'disc silhouette', 'background disc', 'тень диска', 'силуэт диска', 'фоновый диск'],
  },
  {
    id: 'headphones', shadowId: 'headphones-silhouette',
    aliases: ['headphones', 'headphone', 'headset', 'наушники', 'наушников', 'гарнитура', 'гарнитуру'],
    shadowAliases: ['headphone shadow', 'headphones shadow', 'shadow headphones', 'headphones silhouette', 'background headphones', 'тень наушников', 'силуэт наушников', 'фоновые наушники'],
  },
  {
    id: 'desk-lamp', shadowId: 'lamp-silhouette',
    aliases: ['lamp', 'lamps', 'desk lamp', 'table lamp', 'light', 'лампа', 'лампу', 'лампы', 'настольная лампа', 'настольную лампу', 'светильник', 'светильники'],
    shadowAliases: ['lamp shadow', 'shadow lamp', 'lamp silhouette', 'background lamp', 'тень лампы', 'силуэт лампы', 'фоновая лампа'],
  },
  {
    id: 'tulips', shadowId: 'tulips-silhouette',
    aliases: ['tulip', 'tulips', 'flower', 'flowers', 'bouquet', 'vase of flowers', 'тюльпан', 'тюльпаны', 'тюльпанов', 'цветы', 'цветов', 'букет', 'букет цветов', 'букет тюльпанов', 'ваза с цветами'],
    shadowAliases: ['tulip shadow', 'tulips shadow', 'shadow tulips', 'flower shadow', 'background flowers', 'тень тюльпанов', 'тень цветов', 'силуэт цветов', 'фоновые цветы', 'фоновые тюльпаны'],
  },
  {
    id: 'wallet', shadowId: 'wallet-silhouette',
    aliases: ['wallet', 'wallets', 'purse', 'кошелек', 'кошельки', 'кошелёк', 'кошелька', 'портмоне', 'бумажник'],
    shadowAliases: ['wallet shadow', 'shadow wallet', 'wallet silhouette', 'background wallet', 'тень кошелька', 'силуэт кошелька', 'фоновый кошелек'],
  },
  {
    id: 'paper', shadowId: 'paper-silhouette',
    aliases: ['paper', 'papers', 'paper sheets', 'paper sheet', 'sheet', 'sheets', 'notes', 'бумага', 'бумагу', 'лист', 'листы', 'лист бумаги', 'листы бумаги', 'записки', 'заметки'],
    shadowAliases: ['paper shadow', 'shadow paper', 'paper silhouette', 'background paper', 'тень бумаги', 'тень листов', 'силуэт бумаги', 'фоновая бумага'],
  },
  {
    id: 'pen', shadowId: 'pen-silhouette',
    aliases: ['pen', 'pens', 'ballpoint pen', 'ручка', 'ручку', 'ручки', 'шариковая ручка', 'шариковую ручку'],
    shadowAliases: ['pen shadow', 'shadow pen', 'pen silhouette', 'background pen', 'тень ручки', 'силуэт ручки', 'фоновая ручка'],
  },
];

export interface ThemeRule {
  label: string;
  /** Word prefixes support common Russian inflections without substring guesses. */
  prefixes: string[];
  weights: Record<string, number>;
}

export const THEME_RULES: ThemeRule[] = [
  {
    label: 'обучение и знания',
    prefixes: ['знан', 'учеб', 'учен', 'учит', 'обуч', 'образован', 'чтен', 'читать', 'книг', 'открыти', 'knowledge', 'learn', 'educat', 'study', 'read', 'book', 'discover'],
    weights: { book: 12, 'desk-lamp': 8, pen: 5, paper: 4 },
  },
  {
    label: 'общение и совместная работа',
    prefixes: ['общен', 'связ', 'команд', 'вместе', 'объедин', 'соедин', 'сотруднич', 'дружб', 'communication', 'connect', 'team', 'together', 'collabor', 'friend'],
    weights: { phone: 11, 'puzzle-pieces': 10, headphones: 4, pen: 3 },
  },
  {
    label: 'идеи и творчество',
    prefixes: ['иде', 'творч', 'вдохнов', 'воображ', 'креатив', 'искусств', 'creative', 'creativ', 'idea', 'imagin', 'inspir', 'design', 'art'],
    weights: { pen: 10, paper: 9, 'desk-lamp': 8, tulips: 6, 'puzzle-pieces': 4 },
  },
  {
    label: 'фокус и рабочее пространство',
    prefixes: ['работ', 'фокус', 'концентр', 'тишин', 'тих', 'спокой', 'уют', 'ламп', 'светильник', 'focus', 'work', 'calm', 'quiet', 'concentr', 'lamp', 'desk'],
    weights: { 'desk-lamp': 11, headphones: 10, paper: 6, pen: 4, book: 3 },
  },
  {
    label: 'рост и забота',
    prefixes: ['рост', 'развит', 'развив', 'расцвет', 'весн', 'цвет', 'тюльпан', 'забот', 'природ', 'жив', 'growth', 'grow', 'bloom', 'spring', 'care', 'nature', 'flower', 'tulip'],
    weights: { tulips: 12, book: 6, paper: 4, pen: 3 },
  },
  {
    label: 'финансы и деловые задачи',
    prefixes: ['деньг', 'финанс', 'бизнес', 'бюджет', 'доход', 'кошел', 'сбереж', 'эконом', 'money', 'financ', 'business', 'budget', 'wallet', 'saving', 'wealth'],
    weights: { wallet: 14, paper: 7, pen: 5, phone: 4 },
  },
  {
    label: 'музыка и общий ритм',
    prefixes: ['музык', 'ритм', 'звуч', 'звук', 'слуш', 'мелод', 'волне', 'наушник', 'music', 'audio', 'sound', 'listen', 'rhythm', 'melod', 'wavelength', 'headphone', 'disc'],
    weights: { headphones: 12, 'compact-disc': 11, phone: 6, 'puzzle-pieces': 3 },
  },
  {
    label: 'планирование и движение к цели',
    prefixes: ['план', 'организ', 'цел', 'проект', 'запис', 'замет', 'поряд', 'plan', 'organiz', 'goal', 'project', 'note', 'productiv', 'roadmap'],
    weights: { paper: 12, pen: 10, 'puzzle-pieces': 6, 'desk-lamp': 4 },
  },
  {
    label: 'технологии и цифровая среда',
    prefixes: ['цифров', 'технолог', 'интернет', 'инновац', 'телефон', 'смартфон', 'digital', 'technolog', 'internet', 'innovat', 'phone', 'smartphone'],
    weights: { phone: 12, 'puzzle-pieces': 7, 'compact-disc': 5, 'desk-lamp': 3 },
  },
  {
    label: 'поиск решения',
    prefixes: ['решен', 'задач', 'проблем', 'головолом', 'пазл', 'сложн', 'solution', 'solv', 'problem', 'puzzle', 'challenge'],
    weights: { 'puzzle-pieces': 12, 'desk-lamp': 7, book: 5, pen: 4 },
  },
  {
    label: 'память и истории',
    prefixes: ['памят', 'истори', 'архив', 'воспомин', 'memory', 'memori', 'histor', 'archive', 'story'],
    weights: { book: 11, 'compact-disc': 9, paper: 6 },
  },
];
