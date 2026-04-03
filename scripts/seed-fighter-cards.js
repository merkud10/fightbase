#!/usr/bin/env node

const https = require("https");

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const seededFighters = fighters.filter((fighter) => fighter.promotionSlug === "ufc");

const fighters = [
  {
    slug: "alex-pereira",
    name: "Alex Pereira",
    nameRu: "РђР»РµРєСЃ РџРµСЂРµР№СЂР°",
    nickname: "Poatan",
    officialPhotoUrl: "https://ufc.com/images/2025-03/PEREIRA_ALEX_BELT_03-08.png",
    wikiTitle: "Alex_Pereira",
    country: "Brazil",
    weightClass: "Light Heavyweight",
    status: "active",
    record: "13-3",
    age: 38,
    heightCm: 193,
    reachCm: 201,
    team: "Teixeira MMA",
    style: "Kickboxing",
    bio: "РЈРґР°СЂРЅРёРє СЌР»РёС‚РЅРѕРіРѕ СѓСЂРѕРІРЅСЏ СЃ СЂРµРґРєРѕР№ РјРѕС‰СЊСЋ Рё СѓРјРµРЅРёРµРј Р·Р°РІРµСЂС€Р°С‚СЊ Р±РѕР№ РѕРґРЅРёРј С‚РѕС‡РЅС‹Рј РїРѕРїР°РґР°РЅРёРµРј.",
    promotionSlug: "ufc"
  },
  {
    slug: "islam-makhachev",
    name: "Islam Makhachev",
    nameRu: "РСЃР»Р°Рј РњР°С…Р°С‡РµРІ",
    nickname: null,
    officialPhotoUrl: "https://ufc.com/images/2025-01/7/MAKHACHEV_ISLAM_BELT_01-18.png",
    wikiTitle: "Islam_Makhachev",
    country: "Russia",
    weightClass: "Lightweight",
    status: "champion",
    record: "28-1",
    age: 34,
    heightCm: 178,
    reachCm: 179,
    team: "American Kickboxing Academy",
    style: "Sambo",
    bio: "Р§РµРјРїРёРѕРЅ СЃ СЌР»РёС‚РЅС‹Рј РєРѕРЅС‚СЂРѕР»РµРј РІ Р±РѕСЂСЊР±Рµ Рё Р·СЂРµР»РѕР№ СѓРґР°СЂРЅРѕР№ РёРіСЂРѕР№ РЅР° РґРёСЃС‚Р°РЅС†РёРё.",
    promotionSlug: "ufc"
  },
  {
    slug: "shavkat-rakhmonov",
    name: "Shavkat Rakhmonov",
    nameRu: "РЁР°РІРєР°С‚ Р Р°С…РјРѕРЅРѕРІ",
    nickname: null,
    officialPhotoUrl: "https://ufc.com/images/2025-01/5/RAKHMONOV_SHAVKAT_12-07.png",
    wikiTitle: "Shavkat_Rakhmonov",
    country: "Kazakhstan",
    weightClass: "Welterweight",
    status: "active",
    record: "19-0",
    age: 31,
    heightCm: 185,
    reachCm: 196,
    team: "Dar Team",
    style: "Well-rounded",
    bio: "РќРµРїРѕР±РµР¶РґРµРЅРЅС‹Р№ РїРѕР»СѓСЃСЂРµРґРЅРµРІРµСЃ СЃ СѓРЅРёРІРµСЂСЃР°Р»СЊРЅС‹Рј Р°СЂСЃРµРЅР°Р»РѕРј Рё СЏСЂРєРѕ РІС‹СЂР°Р¶РµРЅРЅС‹Рј РёРЅСЃС‚РёРЅРєС‚РѕРј С„РёРЅРёС€РµСЂР°.",
    promotionSlug: "ufc"
  },
  {
    slug: "ilia-topuria",
    name: "Ilia Topuria",
    nameRu: "РР»РёСЏ РўРѕРїСѓСЂРёСЏ",
    nickname: "El Matador",
    officialPhotoUrl: "https://ufc.com/images/2025-06/TOPURIA_ILIA_BELT_10-26.png",
    wikiTitle: "Ilia_Topuria",
    country: "Spain",
    weightClass: "Lightweight",
    status: "champion",
    record: "17-0",
    age: 29,
    heightCm: 170,
    reachCm: 175,
    team: "Climent Club",
    style: "Boxing / Grappling",
    bio: "РћРґРёРЅ РёР· СЃР°РјС‹С… РѕРїР°СЃРЅС‹С… СѓРґР°СЂРЅРёРєРѕРІ РЅРѕРІРѕРіРѕ РїРѕРєРѕР»РµРЅРёСЏ UFC СЃ РєР°С‡РµСЃС‚РІРµРЅРЅРѕР№ Р±РѕСЂСЊР±РѕР№ РІ РїРµСЂРµС…РѕРґРЅС‹С… С„Р°Р·Р°С….",
    promotionSlug: "ufc"
  },
  {
    slug: "merab-dvalishvili",
    name: "Merab Dvalishvili",
    nameRu: "РњРµСЂР°Р± Р”РІР°Р»РёС€РІРёР»Рё",
    nickname: "The Machine",
    officialPhotoUrl: "https://ufc.com/images/2024-09/DVALISHVILI_MERAB_CG_09-14.png",
    wikiTitle: "Merab_Dvalishvili",
    country: "Georgia",
    weightClass: "Bantamweight",
    status: "champion",
    record: "20-4",
    age: 35,
    heightCm: 168,
    reachCm: 173,
    team: "Serra-Longo Fight Team",
    style: "Pressure Wrestling",
    bio: "РўРµРјРїРѕРІРёРє РјРёСЂРѕРІРѕРіРѕ СѓСЂРѕРІРЅСЏ, РєРѕС‚РѕСЂС‹Р№ РІС‹РёРіСЂС‹РІР°РµС‚ Р·Р° СЃС‡РµС‚ РїРѕСЃС‚РѕСЏРЅРЅРѕРіРѕ РґР°РІР»РµРЅРёСЏ, Р±РѕСЂСЊР±С‹ Рё РѕР±СЉРµРјР° СЂР°Р±РѕС‚С‹.",
    promotionSlug: "ufc"
  },
  {
    slug: "tom-aspinall",
    name: "Tom Aspinall",
    nameRu: "РўРѕРј РђСЃРїРёРЅР°Р»Р»",
    nickname: null,
    officialPhotoUrl: "https://ufc.com/images/2025-10/ASPINALL_TOM_BELT_10-25.png",
    wikiTitle: "Tom_Aspinall",
    country: "England",
    weightClass: "Heavyweight",
    status: "champion",
    record: "15-3",
    age: 33,
    heightCm: 196,
    reachCm: 198,
    team: "Team Kaobon",
    style: "Boxing / Jiu-Jitsu",
    bio: "РћС‡РµРЅСЊ Р±С‹СЃС‚СЂС‹Р№ С‚СЏР¶РµР»РѕРІРµСЃ СЃ СЂРµРґРєРёРј РґР»СЏ РґРёРІРёР·РёРѕРЅР° СЃРѕС‡РµС‚Р°РЅРёРµРј РјРѕР±РёР»СЊРЅРѕСЃС‚Рё, Р±РѕРєСЃР° Рё СЃР°Р±РјРёС€РµРЅ-СѓРіСЂРѕР·С‹.",
    promotionSlug: "ufc"
  },
  {
    slug: "dricus-du-plessis",
    name: "Dricus Du Plessis",
    nameRu: "Р”СЂРёРєСѓСЃ РґСЋ РџР»РµСЃСЃРё",
    nickname: "Stillknocks",
    officialPhotoUrl: "https://ufc.com/images/2024-01/DU_PLESSIS_DRICUS_01-20.png",
    wikiTitle: "Dricus_du_Plessis",
    country: "South Africa",
    weightClass: "Middleweight",
    status: "active",
    record: "23-3",
    age: 32,
    heightCm: 185,
    reachCm: 193,
    team: "CIT Performance Institute",
    style: "Pressure Striking",
    bio: "РќРµСѓРґРѕР±РЅС‹Р№ Рё РѕС‡РµРЅСЊ С„РёР·РёС‡РµСЃРєРё СЃРёР»СЊРЅС‹Р№ СЃСЂРµРґРЅРµРІРµСЃ, РєРѕС‚РѕСЂС‹Р№ Р»РѕРјР°РµС‚ СЃС‚СЂСѓРєС‚СѓСЂСѓ Р±РѕСЏ РїРѕСЃС‚РѕСЏРЅРЅС‹Рј РґР°РІР»РµРЅРёРµРј.",
    promotionSlug: "ufc"
  },
  {
    slug: "belal-muhammad",
    name: "Belal Muhammad",
    nameRu: "Р‘РµР»Р°Р» РњСѓС…Р°РјРјР°Рґ",
    nickname: "Remember the Name",
    officialPhotoUrl: "https://ufc.com/images/2025-11/MUHAMMAD_BELAL_11-22.png",
    wikiTitle: "Belal_Muhammad",
    country: "United States",
    weightClass: "Welterweight",
    status: "active",
    record: "24-4",
    age: 37,
    heightCm: 180,
    reachCm: 184,
    team: "Valentino Boxing",
    style: "Pressure Boxing / Wrestling",
    bio: "РЎРёСЃС‚РµРјРЅС‹Р№ РїРѕР»СѓСЃСЂРµРґРЅРµРІРµСЃ, РєРѕС‚РѕСЂС‹Р№ РІС‹РёРіСЂС‹РІР°РµС‚ Р·Р° СЃС‡РµС‚ РґРёСЃС†РёРїР»РёРЅС‹, С‚РµРјРїР° Рё СЂР°СѓРЅРґРѕРІРѕР№ СЃС‚Р°Р±РёР»СЊРЅРѕСЃС‚Рё.",
    promotionSlug: "ufc"
  },
  {
    slug: "movsar-evloev",
    name: "Movsar Evloev",
    nameRu: "РњРѕРІСЃР°СЂ Р•РІР»РѕРµРІ",
    nickname: null,
    officialPhotoUrl: "https://ufc.com/images/2026-03/EVLOEV_MOVSAR_03-21.png",
    wikiTitle: "Movsar_Evloev",
    country: "Russia",
    weightClass: "Featherweight",
    status: "active",
    record: "20-0",
    age: 31,
    heightCm: 173,
    reachCm: 183,
    team: "American Top Team",
    style: "Wrestling",
    bio: "РћРґРёРЅ РёР· СЃР°РјС‹С… РЅРµСѓРґРѕР±РЅС‹С… РїРѕР»СѓР»РµРіРєРѕРІРµСЃРѕРІ UFC СЃ СЃРёР»СЊРЅРѕР№ Р±РѕСЂСЊР±РѕР№ Рё РІС‹СЃРѕРєРёРј Р±РѕР№С†РѕРІСЃРєРёРј IQ.",
    promotionSlug: "ufc"
  },
  {
    slug: "jon-jones",
    name: "Jon Jones",
    nameRu: "Р”Р¶РѕРЅ Р”Р¶РѕРЅСЃ",
    nickname: "Bones",
    wikiTitle: "Jon_Jones",
    country: "United States",
    weightClass: "Heavyweight",
    status: "active",
    record: "28-1",
    age: 38,
    heightCm: 193,
    reachCm: 215,
    team: "Jackson Wink MMA",
    style: "MMA / Wrestling",
    bio: "РћРґРёРЅ РёР· СЃР°РјС‹С… С‚РёС‚СѓР»РѕРІР°РЅРЅС‹С… Р±РѕР№С†РѕРІ РІ РёСЃС‚РѕСЂРёРё UFC СЃ РІС‹РґР°СЋС‰РёРјСЃСЏ Р±РѕР№С†РѕРІСЃРєРёРј РёРЅС‚РµР»Р»РµРєС‚РѕРј Рё Р°РґР°РїС‚Р°С†РёРµР№ РїРѕ С…РѕРґСѓ РїРѕРµРґРёРЅРєР°.",
    promotionSlug: "ufc"
  },
  {
    slug: "umar-nurmagomedov",
    name: "Umar Nurmagomedov",
    nameRu: "РЈРјР°СЂ РќСѓСЂРјР°РіРѕРјРµРґРѕРІ",
    nickname: null,
    wikiTitle: "Umar_Nurmagomedov",
    country: "Russia",
    weightClass: "Bantamweight",
    status: "active",
    record: "18-1",
    age: 30,
    heightCm: 173,
    reachCm: 175,
    team: "Nurmagomedov School",
    style: "Sambo / Kickboxing",
    bio: "РўРµС…РЅРёС‡РЅС‹Р№ Р»РµРіС‡Р°Р№С€РёР№ РІРµСЃ СЃ РѕС‡РµРЅСЊ С‡РёСЃС‚РѕР№ РґРёСЃС‚Р°РЅС†РёРѕРЅРЅРѕР№ СЂР°Р±РѕС‚РѕР№ Рё СЃРёР»СЊРЅРѕР№ Р±Р°Р·РѕР№ РІ Р±РѕСЂСЊР±Рµ.",
    promotionSlug: "ufc"
  },
  {
    slug: "sean-omalley",
    name: "Sean O'Malley",
    nameRu: "РЁРѕРЅ Рћ'РњСЌР»Р»Рё",
    nickname: "Sugar",
    wikiTitle: "Sean_O%27Malley",
    country: "United States",
    weightClass: "Bantamweight",
    status: "active",
    record: "18-3",
    age: 31,
    heightCm: 180,
    reachCm: 183,
    team: "MMA Lab",
    style: "Striking",
    bio: "РћРґРёРЅ РёР· СЃР°РјС‹С… РјРµРґРёР№РЅС‹С… Р±РѕР№С†РѕРІ UFC, РѕРїР°СЃРЅС‹Р№ Р·Р° СЃС‡РµС‚ С‚Р°Р№РјРёРЅРіР°, С„СѓС‚РІРѕСЂРєР° Рё РЅРѕРєР°СѓС‚РёСЂСѓСЋС‰РµР№ С‚РѕС‡РЅРѕСЃС‚Рё.",
    promotionSlug: "ufc"
  },
  {
    slug: "khamzat-chimaev",
    name: "Khamzat Chimaev",
    nameRu: "РҐР°РјР·Р°С‚ Р§РёРјР°РµРІ",
    nickname: "Borz",
    wikiTitle: "Khamzat_Chimaev",
    country: "United Arab Emirates",
    weightClass: "Middleweight",
    status: "active",
    record: "15-0",
    age: 31,
    heightCm: 188,
    reachCm: 191,
    team: "Allstars Training Center",
    style: "Wrestling / Pressure",
    bio: "РњРѕС‰РЅС‹Р№ СѓРЅРёРІРµСЂСЃР°Р», РєРѕС‚РѕСЂС‹Р№ РѕРїР°СЃРµРЅ Рё РІ Р±РѕСЂСЊР±Рµ, Рё РІ СЃС‚РѕР№РєРµ, РѕСЃРѕР±РµРЅРЅРѕ РєРѕРіРґР° Р±С‹СЃС‚СЂРѕ Р·Р°Р±РёСЂР°РµС‚ РёРЅРёС†РёР°С‚РёРІСѓ.",
    promotionSlug: "ufc"
  },
  {
    slug: "leon-edwards",
    name: "Leon Edwards",
    nameRu: "Р›РµРѕРЅ Р­РґРІР°СЂРґСЃ",
    nickname: "Rocky",
    wikiTitle: "Leon_Edwards",
    country: "England",
    weightClass: "Welterweight",
    status: "active",
    record: "22-5",
    age: 34,
    heightCm: 188,
    reachCm: 188,
    team: "Team Renegade",
    style: "Striking / Clinch",
    bio: "Р­Р»РёС‚РЅС‹Р№ РїРѕР»СѓСЃСЂРµРґРЅРµРІРµСЃ СЃ РѕС‡РµРЅСЊ С‡РёСЃС‚РѕР№ СѓРґР°СЂРЅРѕР№ С€РєРѕР»РѕР№, РѕС‚Р»РёС‡РЅС‹Рј РєР»РёРЅС‡РµРј Рё С…РѕСЂРѕС€РёРј РєРѕРЅС‚СЂРѕР»РµРј РґРёСЃС‚Р°РЅС†РёРё.",
    promotionSlug: "ufc"
  },
  {
    slug: "arman-tsarukyan",
    name: "Arman Tsarukyan",
    nameRu: "РђСЂРјР°РЅ Р¦Р°СЂСѓРєСЏРЅ",
    nickname: "Ahalkalakets",
    wikiTitle: "Arman_Tsarukyan",
    country: "Armenia",
    weightClass: "Lightweight",
    status: "active",
    record: "22-3",
    age: 29,
    heightCm: 170,
    reachCm: 184,
    team: "American Top Team",
    style: "Wrestling / Boxing",
    bio: "Р‘С‹СЃС‚СЂС‹Р№ Рё РІР·СЂС‹РІРЅРѕР№ Р»РµРіРєРѕРІРµСЃ СЃ СЃРёР»СЊРЅРѕР№ Р±РѕСЂСЊР±РѕР№ Рё Р·Р°РјРµС‚РЅС‹Рј РїСЂРѕРіСЂРµСЃСЃРѕРј РІ СЃС‚РѕР№РєРµ.",
    promotionSlug: "ufc"
  },
  {
    slug: "magomed-ankalaev",
    name: "Magomed Ankalaev",
    nameRu: "РњР°РіРѕРјРµРґ РђРЅРєР°Р»Р°РµРІ",
    nickname: null,
    wikiTitle: "Magomed_Ankalaev",
    country: "Russia",
    weightClass: "Light Heavyweight",
    status: "champion",
    record: "21-1-1",
    age: 34,
    heightCm: 190,
    reachCm: 191,
    team: "Gorets Fight Club",
    style: "Kickboxing / Sambo",
    bio: "РџРѕР»СѓС‚СЏР¶РµР»РѕРІРµСЃ СЃ РѕС‡РµРЅСЊ СЃРѕР±СЂР°РЅРЅРѕР№ СѓРґР°СЂРЅРѕР№ Р±Р°Р·РѕР№ Рё СЃРёР»СЊРЅРѕР№ Р·Р°С‰РёС‚РѕР№ РѕС‚ СЂРёСЃРєР° РІ РґР»РёРЅРЅС‹С… Р±РѕСЏС….",
    promotionSlug: "ufc"
  },
  {
    slug: "zhang-weili",
    name: "Zhang Weili",
    nameRu: "Р§Р¶Р°РЅ Р’СЌР№Р»Рё",
    nickname: "Magnum",
    wikiTitle: "Zhang_Weili",
    country: "China",
    weightClass: "Strawweight",
    status: "champion",
    record: "26-3",
    age: 36,
    heightCm: 163,
    reachCm: 160,
    team: "Black Tiger Fight Club",
    style: "Sanda / Wrestling",
    bio: "РћРґРЅР° РёР· РіР»Р°РІРЅС‹С… Р·РІРµР·Рґ Р¶РµРЅСЃРєРѕРіРѕ MMA СЃ РїР»РѕС‚РЅРѕР№ СѓРґР°СЂРєРѕР№, С„РёР·РёС‡РµСЃРєРѕР№ РјРѕС‰СЊСЋ Рё С…РѕСЂРѕС€РёРјРё РїРµСЂРµС…РѕРґР°РјРё РІ Р±РѕСЂСЊР±Сѓ.",
    promotionSlug: "ufc"
  },
  {
    slug: "valentina-shevchenko",
    name: "Valentina Shevchenko",
    nameRu: "Р’Р°Р»РµРЅС‚РёРЅР° РЁРµРІС‡РµРЅРєРѕ",
    nickname: "Bullet",
    wikiTitle: "Valentina_Shevchenko",
    country: "Kyrgyzstan",
    weightClass: "Flyweight",
    status: "champion",
    record: "25-4-1",
    age: 38,
    heightCm: 165,
    reachCm: 169,
    team: "Tiger Muay Thai",
    style: "Muay Thai / MMA",
    bio: "РћРґРЅР° РёР· СЃР°РјС‹С… С‚РµС…РЅРёС‡РЅС‹С… С‡РµРјРїРёРѕРЅРѕРє РІ РёСЃС‚РѕСЂРёРё UFC СЃ РІС‹РґР°СЋС‰РµР№СЃСЏ СѓРґР°СЂРЅРѕР№ С€РєРѕР»РѕР№ Рё Р±РѕР»СЊС€РёРј РѕРїС‹С‚РѕРј С‚РёС‚СѓР»СЊРЅС‹С… Р±РѕРµРІ.",
    promotionSlug: "ufc"
  },
  {
    slug: "manon-fiorot",
    name: "Manon Fiorot",
    nameRu: "РњР°РЅРѕРЅ Р¤РёРѕСЂРѕ",
    nickname: "The Beast",
    wikiTitle: "Manon_Fiorot",
    country: "France",
    weightClass: "Flyweight",
    status: "active",
    record: "12-2",
    age: 35,
    heightCm: 170,
    reachCm: 168,
    team: "Boxing Squad",
    style: "Karate / Kickboxing",
    bio: "РўРµС…РЅРёС‡РЅР°СЏ СѓРґР°СЂРЅРёС†Р°, РєРѕС‚РѕСЂР°СЏ РґРµСЂР¶РёС‚ С‚РµРјРї Рё Р»СЋР±РёС‚ СЂР°Р·СЂСѓС€Р°С‚СЊ СЂРёС‚Рј СЃРѕРїРµСЂРЅРёС†С‹ С‡РµСЂРµР· РґРІРёР¶РµРЅРёРµ Рё РїСЂСЏРјС‹Рµ Р°С‚Р°РєРё.",
    promotionSlug: "ufc"
  },
  {
    slug: "kayla-harrison",
    name: "Kayla Harrison",
    nameRu: "РљР°Р№Р»Р° РҐР°СЂСЂРёСЃРѕРЅ",
    nickname: null,
    wikiTitle: "Kayla_Harrison",
    country: "United States",
    weightClass: "Bantamweight",
    status: "active",
    record: "19-1",
    age: 35,
    heightCm: 173,
    reachCm: 168,
    team: "American Top Team",
    style: "Judo / Wrestling",
    bio: "РћР»РёРјРїРёР№СЃРєР°СЏ С‡РµРјРїРёРѕРЅРєР° РїРѕ РґР·СЋРґРѕ, РїРµСЂРµРІРµРґС€Р°СЏ СЃРІРѕСЋ СЃРёР»РѕРІСѓСЋ Р±Р°Р·Сѓ Рё РєРѕРЅС‚СЂРѕР»СЊ РІ С‚РёС‚СѓР»СЊРЅСѓСЋ РіРѕРЅРєСѓ MMA.",
    promotionSlug: "ufc"
  },
];

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        {
          headers: {
            "User-Agent": "FightBaseBot/1.0"
          }
        },
        (response) => {
          const chunks = [];
          response.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
          response.on("end", () => {
            const payload = Buffer.concat(chunks).toString("utf8");
            if ((response.statusCode ?? 500) >= 400) {
              reject(new Error(`HTTP ${response.statusCode} for ${url}`));
              return;
            }
            resolve(payload);
          });
        }
      )
      .on("error", reject);
  });
}

async function fetchJson(url) {
  const payload = await fetchText(url);
  return JSON.parse(payload);
}

async function resolvePhotoUrl(fighter) {
  if (fighter.officialPhotoUrl) {
    return fighter.officialPhotoUrl;
  }

  if (!fighter.wikiTitle) {
    return fighter.photoUrl ?? null;
  }

  const wikiLang = fighter.wikiLang || "en";
  const summaryUrl = `https://${wikiLang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(fighter.wikiTitle)}`;

  try {
    const summary = await fetchJson(summaryUrl);
    return summary.originalimage?.source || summary.thumbnail?.source || fighter.photoUrl || null;
  } catch {
    return fighter.photoUrl || null;
  }
}

async function main() {
  const promotions = await prisma.promotion.findMany({
    select: { id: true, slug: true }
  });

  const promotionMap = Object.fromEntries(promotions.map((promotion) => [promotion.slug, promotion.id]));

  let created = 0;
  let updated = 0;

  for (const fighter of seededFighters) {
    const promotionId = promotionMap[fighter.promotionSlug];
    if (!promotionId) {
      throw new Error(`Promotion not found for slug: ${fighter.promotionSlug}`);
    }

    const photoUrl = await resolvePhotoUrl(fighter);

    const payload = {
      slug: fighter.slug,
      name: fighter.name,
      nameRu: fighter.nameRu,
      nickname: fighter.nickname,
      photoUrl,
      country: fighter.country,
      weightClass: fighter.weightClass,
      status: fighter.status,
      record: fighter.record,
      age: fighter.age,
      heightCm: fighter.heightCm,
      reachCm: fighter.reachCm,
      team: fighter.team,
      style: fighter.style,
      bio: fighter.bio,
      promotionId
    };

    const existing = await prisma.fighter.findUnique({
      where: { slug: fighter.slug },
      select: { id: true }
    });

    if (existing) {
      await prisma.fighter.update({
        where: { id: existing.id },
        data: payload
      });
      updated += 1;
      console.log(`Updated fighter: ${fighter.name}`);
    } else {
      await prisma.fighter.create({
        data: payload
      });
      created += 1;
      console.log(`Created fighter: ${fighter.name}`);
    }
  }

  console.log(`Created: ${created}`);
  console.log(`Updated: ${updated}`);
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
