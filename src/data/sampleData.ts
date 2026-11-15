import { CategoryRecord, SongRecord } from '../types';
import { computeSearchKey } from '../lib/normalize';
import { extractYouTubeVideoId } from '../lib/youtube';

export const STARTER_CATEGORIES: CategoryRecord[] = [
  { id: 'cat_folk', name: 'Folk', sortOrder: 1 },
  { id: 'cat_baul', name: 'Baul', sortOrder: 2 },
  { id: 'cat_modern', name: 'Modern', sortOrder: 3 },
  { id: 'cat_patriotic', name: 'Patriotic', sortOrder: 4 },
  { id: 'cat_adda', name: 'Group / Adda', sortOrder: 5 },
  { id: 'cat_regional', name: 'Regional', sortOrder: 6 },
  { id: 'cat_other', name: 'Other', sortOrder: 7 },
];

/**
 * Public domain and traditional Bengali songs for starter library
 */
export const STARTER_SONGS_RAW = [
  {
    importSerial: 1,
    titleLatin: 'Milon Hobe Koto Dine',
    titleBn: 'মিলন হবে কত দিনে',
    aliases: ['Milon hobe koto dine amar moner manusher shonay', 'Lalon Geeti'],
    categoryId: 'cat_baul',
    youtubeUrl: 'https://www.youtube.com/watch?v=kYJqD2gQzG4',
    lyricsStatus: 'reviewed' as const,
    lyricsOrigin: 'typed' as const,
    lyricsBn: `মিলন হবে কত দিনে
আমার মনের মানুষের সনে।

চাতক প্রায় অহর্নিশি
চেয়ে আছি কালো শশী
হব বলে চরণদাসী
ও তা হয় না কপাল গুণে।

মেঘের বিদ্যুৎ মেঘেই যেমন
লুকালে না পায় অন্বেষণ
কালারে হারায়ে তেমন
ঐ রূপ হেরি দর্পণে।

যখন রূপের ঝলক দেয়
ঐ রূপে রূপ মিশে রয়
লালন বলে অন্তরে বয়
তারে ধরব কেমন জ্ঞানে।`,
    notes: 'Traditional Baul song composed by Fakir Lalon Shah. Public domain.',
  },
  {
    importSerial: 2,
    titleLatin: 'Agey Ki Shundor Din Kataitam',
    titleBn: 'আগে কী সুন্দর দিন কাটাইতাম',
    aliases: ['Age ki sundor din kataitam', 'Shah Abdul Karim folk song'],
    categoryId: 'cat_folk',
    youtubeUrl: 'https://www.youtube.com/watch?v=0h3jKq31Q_E',
    lyricsStatus: 'reviewed' as const,
    lyricsOrigin: 'typed' as const,
    lyricsBn: `আগে কী সুন্দর দিন কাটাইতাম
গ্রামের নওজোয়ান হিন্দু-মুসলমান
মিলিয়া বাউলা গান আর মুর্শিদি গাইতাম
আগে কী সুন্দর দিন কাটাইতাম।

বর্ষা যখন হইতো গাজীর গান আইতো
রঙে ঢঙে গাইতো আনন্দ পাইতাম
বাউলা গান হইতো ভাটিয়ালী গাইতাম
আগে কী সুন্দর দিন কাটাইতাম।

হিন্দু বাড়ি পূজা হইত নিমন্ত্রণ আমরা পাইতাম
বাড়ি গিয়া গান শুনিয়া আনন্দিত হইতাম
পরস্পর মিল ছিল কত না ভাবিতাম
আগে কী সুন্দর দিন কাটাইতাম।`,
    notes: 'Beloved folk song of communal harmony by Baul Samrat Shah Abdul Karim.',
  },
  {
    importSerial: 3,
    titleLatin: 'Nesha Lagilo Re',
    titleBn: 'নেশা লাগিল রে',
    aliases: ['Hason Raja', 'Nesha lagilo re baka du noyoner nesha lagilo re'],
    categoryId: 'cat_baul',
    youtubeUrl: 'https://www.youtube.com/watch?v=eE7O9K0uKlo',
    lyricsStatus: 'reviewed' as const,
    lyricsOrigin: 'typed' as const,
    lyricsBn: `নেশা লাগিল রে, বাঁকা দুই নয়নের নেশা লাগিল রে
হাঁসনের মনে যে কী ছিল
বাঁকা নয়নে মন কাড়িয়া নিল।

হাসন রাজায় এই গান গায়
চরণে ধরিয়া কান্দে গোবিন্দজির পায়।
নেশা লাগিল রে, বাঁকা দুই নয়নের নেশা লাগিল রে।`,
    notes: 'Mystic folk lyrics by Hason Raja. Public domain.',
  },
  {
    importSerial: 4,
    titleLatin: 'Dhitang Dhitang Bole',
    titleBn: 'ধিতাং ধিতাং বোলে',
    aliases: ['Salil Chowdhury', 'Ke jae shona jae'],
    categoryId: 'cat_adda',
    youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    lyricsStatus: 'unreviewed' as const,
    lyricsOrigin: 'pasted' as const,
    lyricsBn: `ধিতাং ধিতাং বোলে
কে মাদলে এমন তালে তান তোলে রে
আয় ছুটে আয় পূব গগনে
রাঙা সুরয হাসে রে।

নতুন ধানের গন্ধে বাতাস দোলে
মাঠে মাঠে সোনার ফসল দোলে
কাস্তে হাতে কৃষাণ হাসে
আনন্দ গান তোলে রে।`,
    notes: 'Tour gathering chorus song for addas.',
  },
  {
    importSerial: 5,
    titleLatin: 'Amar Shonar Bangla',
    titleBn: 'আমার সোনার বাংলা',
    aliases: ['National Anthem', 'Rabindranath Tagore'],
    categoryId: 'cat_patriotic',
    youtubeUrl: 'https://www.youtube.com/watch?v=1x4Uq123abc',
    lyricsStatus: 'reviewed' as const,
    lyricsOrigin: 'typed' as const,
    lyricsBn: `আমার সোনার বাংলা, আমি তোমায় ভালোবাসি।
চিরদিন তোমার আকাশ, তোমার বাতাস, আমার প্রাণে বাজায় বাঁশি।

ও মা, ফাগুনে তোর আমের বনে ঘ্রাণে পাগল করে,
মরি হায়, হায় রে—
ও মা, অঘ্রানে তোর ভরা ক্ষেতে আমি কী দেখেছি মধুর হাসি।

কী শোভা, কী ছায়া গো, কী স্নেহ, কী মায়া গো—
কী আঁচল বিছায়েছ বটের মূলে, নদীর কূলে কূলে।
মা, তোর মুখের বাণী আমার কানে লাগে সুধার মতো,
মরি হায়, হায় রে—
মা, তোর বদনখানি মলিন হলে, ও মা, আমি নয়নজলে ভাসি।`,
    notes: 'Public domain patriotic anthem.',
  },
  {
    importSerial: 6,
    titleLatin: 'Loke Bole Bole Re',
    titleBn: 'লোকে বলে বলে রে ঘর বাড়ি ভালা না আমার',
    aliases: ['Hason Raja', 'Ghor bari bhala na amar'],
    categoryId: 'cat_baul',
    youtubeUrl: '',
    lyricsStatus: 'missing' as const,
    lyricsOrigin: null,
    lyricsBn: '',
    notes: 'Missing lyrics example to test Paste & Clean or Fetch.',
  },
  {
    importSerial: 7,
    titleLatin: 'Sohag Chand Bodoni Dhoni',
    titleBn: 'সোহাগ চাঁদ বদনী ধ্বনি নাচো তো দেখি',
    aliases: ['Sohag chand', 'Traditional Dhamail'],
    categoryId: 'cat_folk',
    youtubeUrl: '',
    lyricsStatus: 'missing' as const,
    lyricsOrigin: null,
    lyricsBn: '',
    notes: 'Popular tour dance and dhamail rhythm. Missing lyrics example.',
  },
];

export function generateStarterSongs(): SongRecord[] {
  const now = new Date().toISOString();
  return STARTER_SONGS_RAW.map((item, idx) => {
    const videoId = extractYouTubeVideoId(item.youtubeUrl);
    const searchKey = computeSearchKey(item.titleBn, item.titleLatin, item.aliases);
    return {
      id: `sample_song_${idx + 1}`,
      importSerial: item.importSerial,
      titleLatin: item.titleLatin,
      titleBn: item.titleBn,
      aliases: item.aliases,
      categoryId: item.categoryId,
      youtubeUrl: item.youtubeUrl,
      youtubeVideoId: videoId,
      lyricsBn: item.lyricsBn,
      lyricsStatus: item.lyricsStatus,
      lyricsOrigin: item.lyricsOrigin,
      sources: item.lyricsStatus !== 'missing' ? [
        {
          url: 'https://traditional-folk.sample/public-domain',
          siteId: 'public_domain',
          fetchedAt: now,
          coverage: 1.0,
        }
      ] : [],
      notes: item.notes,
      searchKey,
      createdAt: now,
      updatedAt: now,
      lyricsUpdatedAt: item.lyricsStatus !== 'missing' ? now : null,
      playCount: 0,
      lastPlayedAt: null,
      totalListenTimeSec: 0,
      hasAudio: false,
      audioMeta: null,
    };
  });
}
