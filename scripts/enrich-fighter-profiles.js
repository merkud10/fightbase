#!/usr/bin/env node

const https = require("https");

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const fighterConfigs = [
  {
    slug: "alex-pereira",
    wikiTitle: "Alex_Pereira",
    wikiLang: "en",
    nameRu: "РђР»РµРєСЃ РџРµСЂРµР№СЂР°",
    photoUrl: "https://ufc.com/images/2025-03/PEREIRA_ALEX_BELT_03-08.png",
    bioRu:
      "РђР»РµРєСЃ РџРµСЂРµР№СЂР° вЂ” Р±СЂР°Р·РёР»СЊСЃРєРёР№ Р±РѕРµС† РњРњРђ Рё Р±С‹РІС€РёР№ СЌР»РёС‚РЅС‹Р№ РєРёРєР±РѕРєСЃРµСЂ, РїСЂРѕСЃР»Р°РІРёРІС€РёР№СЃСЏ РЅРѕРєР°СѓС‚РёСЂСѓСЋС‰РµР№ РјРѕС‰СЊСЋ Рё С…Р»Р°РґРЅРѕРєСЂРѕРІРЅРѕР№ СЂР°Р±РѕС‚РѕР№ РЅР° РґРёСЃС‚Р°РЅС†РёРё. Р’ UFC РѕРЅ СѓСЃРїРµР» Р·Р°РІРѕРµРІР°С‚СЊ С‚РёС‚СѓР»С‹ РІ СЃСЂРµРґРЅРµРј Рё РїРѕР»СѓС‚СЏР¶РµР»РѕРј РІРµСЃРµ, Р° РїРµСЂРµС…РѕРґ РёР· РєРёРєР±РѕРєСЃРёРЅРіР° РІ РњРњРђ СЃРґРµР»Р°Р» РІ СЂРµРєРѕСЂРґРЅРѕ РєРѕСЂРѕС‚РєРёРµ СЃСЂРѕРєРё. РџРµСЂРµР№СЂР° РѕСЃРѕР±РµРЅРЅРѕ РѕРїР°СЃРµРЅ РІ СЃС‚РѕР№РєРµ, РіРґРµ СЃРѕС‡РµС‚Р°РµС‚ С‚Р°Р№РјРёРЅРі, Р¶РµСЃС‚РєРёР№ Р»РµРІС‹Р№ С…СѓРє Рё СЂРµРґРєРѕРµ СЃРїРѕРєРѕР№СЃС‚РІРёРµ РїРѕРґ РґР°РІР»РµРЅРёРµРј."
  },
  {
    slug: "islam-makhachev",
    wikiTitle: "Islam_Makhachev",
    wikiLang: "en",
    nameRu: "РСЃР»Р°Рј РњР°С…Р°С‡РµРІ",
    photoUrl: "https://ufc.com/images/2025-01/7/MAKHACHEV_ISLAM_BELT_01-18.png",
    bioRu:
      "РСЃР»Р°Рј РњР°С…Р°С‡РµРІ вЂ” СЂРѕСЃСЃРёР№СЃРєРёР№ Р±РѕРµС† РёР· Р”Р°РіРµСЃС‚Р°РЅР°, РѕРґРёРЅ РёР· РіР»Р°РІРЅС‹С… РїСЂРµРґСЃС‚Р°РІРёС‚РµР»РµР№ С€РєРѕР»С‹ Р±РѕРµРІРѕРіРѕ СЃР°РјР±Рѕ РІ СЃРѕРІСЂРµРјРµРЅРЅРѕРј РњРњРђ. РћРЅ РїРѕСЃС‚СЂРѕРёР» РєР°СЂСЊРµСЂСѓ РЅР° РєРѕРЅС‚СЂРѕР»Рµ РІ РїР°СЂС‚РµСЂРµ, РїРѕР·РёС†РёРѕРЅРЅРѕР№ РґРёСЃС†РёРїР»РёРЅРµ Рё СѓРјРµРЅРёРё РїРѕСЃС‚РµРїРµРЅРЅРѕ Р»РѕРјР°С‚СЊ СЃРѕРїРµСЂРЅРёРєР° РїРѕ С…РѕРґСѓ Р±РѕСЏ. РњР°С…Р°С‡РµРІ РґРѕР»РіРѕРµ РІСЂРµРјСЏ Р±С‹Р» РєР»СЋС‡РµРІРѕР№ С„РёРіСѓСЂРѕР№ Р»РµРіРєРѕРіРѕ РІРµСЃР° UFC Рё РѕСЃС‚Р°РµС‚СЃСЏ СЌС‚Р°Р»РѕРЅРѕРј С‚Р°РєС‚РёС‡РµСЃРєРѕРіРѕ РґР°РІР»РµРЅРёСЏ РІ С‡РµРјРїРёРѕРЅСЃРєРёС… РїРѕРµРґРёРЅРєР°С…."
  },
  {
    slug: "shavkat-rakhmonov",
    wikiTitle: "Shavkat_Rakhmonov",
    wikiLang: "en",
    nameRu: "РЁР°РІРєР°С‚ Р Р°С…РјРѕРЅРѕРІ",
    photoUrl: "https://ufc.com/images/2025-01/5/RAKHMONOV_SHAVKAT_12-07.png",
    bioRu:
      "РЁР°РІРєР°С‚ Р Р°С…РјРѕРЅРѕРІ вЂ” РєР°Р·Р°С…СЃС‚Р°РЅСЃРєРёР№ РїРѕР»СѓСЃСЂРµРґРЅРµРІРµСЃ, РєРѕС‚РѕСЂРѕРіРѕ С†РµРЅСЏС‚ Р·Р° СѓРЅРёРІРµСЂСЃР°Р»СЊРЅРѕСЃС‚СЊ Рё СѓРјРµРЅРёРµ С„РёРЅРёС€РёСЂРѕРІР°С‚СЊ РІ Р»СЋР±РѕР№ С„Р°Р·Рµ Р±РѕСЏ. РћРЅ РѕРґРёРЅР°РєРѕРІРѕ РѕРїР°СЃРµРЅ РІ СЃС‚РѕР№РєРµ Рё РЅР° Р·РµРјР»Рµ, Р° РµРіРѕ С„РёСЂРјРµРЅРЅС‹Р№ СЃС‚РёР»СЊ СЃС‚СЂРѕРёС‚СЃСЏ РЅР° РґР°РІР»РµРЅРёРё, РґР»РёРЅРЅС‹С… РєРѕРјР±РёРЅР°С†РёСЏС… Рё СЃРїРѕРєРѕР№СЃС‚РІРёРё РІ СЂР°Р·РјРµРЅР°С…. Р Р°С…РјРѕРЅРѕРІ Р±С‹СЃС‚СЂРѕ РїСЂРµРІСЂР°С‚РёР»СЃСЏ РёР· РїРµСЂСЃРїРµРєС‚РёРІРЅРѕРіРѕ РїСЂРѕСЃРїРµРєС‚Р° РІ РїРѕСЃС‚РѕСЏРЅРЅРѕРіРѕ СѓС‡Р°СЃС‚РЅРёРєР° С‚РёС‚СѓР»СЊРЅС‹С… СЂР°Р·РіРѕРІРѕСЂРѕРІ UFC."
  },
  {
    slug: "ilia-topuria",
    wikiTitle: "Ilia_Topuria",
    wikiLang: "en",
    nameRu: "РР»РёСЏ РўРѕРїСѓСЂРёСЏ",
    photoUrl: "https://ufc.com/images/2025-06/TOPURIA_ILIA_BELT_10-26.png",
    bioRu:
      "РР»РёСЏ РўРѕРїСѓСЂРёСЏ вЂ” РѕРґРёРЅ РёР· СЃР°РјС‹С… СЏСЂРєРёС… Р±РѕР№С†РѕРІ РЅРѕРІРѕРіРѕ РїРѕРєРѕР»РµРЅРёСЏ, РїСЂРµРґСЃС‚Р°РІР»СЏСЋС‰РёР№ Р“СЂСѓР·РёСЋ Рё РСЃРїР°РЅРёСЋ. РћРЅ СЃРѕС‡РµС‚Р°РµС‚ РїР»РѕС‚РЅС‹Р№ Р±РѕРєСЃ, СѓРІРµСЂРµРЅРЅСѓСЋ Р±РѕСЂСЊР±Сѓ Рё СЂРµРґРєСѓСЋ РґР»СЏ С‚РѕРї-СѓСЂРѕРІРЅСЏ СѓРІРµСЂРµРЅРЅРѕСЃС‚СЊ РІ СЂР°Р·РјРµРЅР°С…, РёР·-Р·Р° С‡РµРіРѕ Р±С‹СЃС‚СЂРѕ РІС‹С€РµР» РІ С‡РёСЃР»Рѕ РіР»Р°РІРЅС‹С… Р·РІРµР·Рґ UFC. РўРѕРїСѓСЂРёСЏ РёР·РІРµСЃС‚РµРЅ С‚РµРј, С‡С‚Рѕ РЅР°РІСЏР·С‹РІР°РµС‚ СЃРѕРїРµСЂРЅРёРєР°Рј РІС‹СЃРѕРєРёР№ С‚РµРјРї Рё С‡Р°СЃС‚Рѕ Р·Р°РєР°РЅС‡РёРІР°РµС‚ СЌРїРёР·РѕРґС‹ СЃРµСЂРёР№РЅРѕР№ Р°С‚Р°РєРѕР№."
  },
  {
    slug: "merab-dvalishvili",
    wikiTitle: "Merab_Dvalishvili",
    wikiLang: "en",
    nameRu: "РњРµСЂР°Р± Р”РІР°Р»РёС€РІРёР»Рё",
    photoUrl: "https://ufc.com/images/2024-09/DVALISHVILI_MERAB_CG_09-14.png",
    bioRu:
      "РњРµСЂР°Р± Р”РІР°Р»РёС€РІРёР»Рё вЂ” РіСЂСѓР·РёРЅСЃРєРёР№ Р±РѕРµС†, РєРѕС‚РѕСЂС‹Р№ СЃС‚Р°Р» СЃРёРјРІРѕР»РѕРј Р±РµС€РµРЅРѕРіРѕ С‚РµРјРїР° Рё РЅРµРїСЂРµСЂС‹РІРЅРѕРіРѕ РїСЂРµСЃСЃРёРЅРіР° РІ Р»РµРіС‡Р°Р№С€РµРј РІРµСЃРµ UFC. Р•РіРѕ СЃС‚РёР»СЊ СЃС‚СЂРѕРёС‚СЃСЏ РЅР° СЃРµСЂРёР№РЅС‹С… РїСЂРѕС…РѕРґР°С… РІ РЅРѕРіРё, РїРѕСЃС‚РѕСЏРЅРЅРѕРј РґРІРёР¶РµРЅРёРё Рё СЃРїРѕСЃРѕР±РЅРѕСЃС‚Рё РґРµСЂР¶Р°С‚СЊ РІС‹СЃРѕРєРёР№ РѕР±СЉРµРј СЂР°Р±РѕС‚С‹ РІСЃРµ РїСЏС‚СЊ СЂР°СѓРЅРґРѕРІ. Р—Р° СЃС‡РµС‚ СЌС‚РѕРіРѕ Р”РІР°Р»РёС€РІРёР»Рё РїСЂРµРІСЂР°С‚РёР»СЃСЏ РІ РѕРґРЅСѓ РёР· РєР»СЋС‡РµРІС‹С… С„РёРіСѓСЂ РґРёРІРёР·РёРѕРЅР° Рё РїРѕСЃС‚РѕСЏРЅРЅРѕРіРѕ СѓС‡Р°СЃС‚РЅРёРєР° С‚РёС‚СѓР»СЊРЅРѕР№ РіРѕРЅРєРё."
  },
  {
    slug: "tom-aspinall",
    wikiTitle: "Tom_Aspinall",
    wikiLang: "en",
    nameRu: "РўРѕРј РђСЃРїРёРЅР°Р»Р»",
    photoUrl: "https://ufc.com/images/2025-10/ASPINALL_TOM_BELT_10-25.png",
    bioRu:
      "РўРѕРј РђСЃРїРёРЅР°Р»Р» вЂ” Р±СЂРёС‚Р°РЅСЃРєРёР№ С‚СЏР¶РµР»РѕРІРµСЃ, РєРѕС‚РѕСЂРѕРіРѕ РІС‹РґРµР»СЏСЋС‚ СЃРєРѕСЂРѕСЃС‚СЊ СЂСѓРє, С‚РµС…РЅРёРєР° РЅР° РІС‹С…РѕРґР°С… Рё СЂРµРґРєР°СЏ РґР»СЏ РґРёРІРёР·РёРѕРЅР° РјРѕР±РёР»СЊРЅРѕСЃС‚СЊ. РћРЅ РѕРґРёРЅР°РєРѕРІРѕ РѕРїР°СЃРµРЅ РІ СЂР°Р·РјРµРЅР°С… Рё РІ РїР°СЂС‚РµСЂРµ, Р° РјРЅРѕРіРёРµ РїРѕР±РµРґС‹ РѕС„РѕСЂРјР»СЏР» РІ СЃС‚Р°СЂС‚РѕРІС‹С… РјРёРЅСѓС‚Р°С… Р·Р° СЃС‡РµС‚ СЂРµР·РєРѕРіРѕ СЃС‚Р°СЂС‚Р°. РђСЃРїРёРЅР°Р»Р» СЃС‡РёС‚Р°РµС‚СЃСЏ РѕРґРЅРёРј РёР· СЃР°РјС‹С… С‚РµС…РЅРёС‡РЅС‹С… С‚СЏР¶РµР»РѕРІРµСЃРѕРІ РЅРѕРІРѕР№ РІРѕР»РЅС‹ РІ UFC."
  },
  {
    slug: "dricus-du-plessis",
    wikiTitle: "Dricus_du_Plessis",
    wikiLang: "en",
    nameRu: "Р”СЂРёРєСѓСЃ РґСЋ РџР»РµСЃСЃРё",
    photoUrl: "https://ufc.com/images/2024-01/DU_PLESSIS_DRICUS_01-20.png",
    bioRu:
      "Р”СЂРёРєСѓСЃ РґСЋ РџР»РµСЃСЃРё вЂ” СЋР¶РЅРѕР°С„СЂРёРєР°РЅСЃРєРёР№ Р±РѕРµС†, РєРѕС‚РѕСЂС‹Р№ РїСЂРѕС€РµР» РїСѓС‚СЊ РѕС‚ СЂРµРіРёРѕРЅР°Р»СЊРЅС‹С… С‚РёС‚СѓР»РѕРІ РґРѕ С‡РµРјРїРёРѕРЅСЃРєРёС… Р±РѕРµРІ РІ UFC. Р•РіРѕ СЃС‚РёР»СЊ РЅРµ РІСЃРµРіРґР° РІС‹РіР»СЏРґРёС‚ Р°РєР°РґРµРјРёС‡РЅРѕ, РЅРѕ РѕРЅ РєСЂР°Р№РЅРµ РЅРµСѓРґРѕР±РµРЅ Р·Р° СЃС‡РµС‚ С„РёР·РёС‡РµСЃРєРѕР№ РјРѕС‰Рё, РїРѕСЃС‚РѕСЏРЅРЅРѕРіРѕ РґР°РІР»РµРЅРёСЏ Рё СѓРјРµРЅРёСЏ РІС‹Р¶РёРІР°С‚СЊ РІ С‚СЏР¶РµР»С‹С… СЌРїРёР·РѕРґР°С…. Р”СЋ РџР»РµСЃСЃРё РѕСЃРѕР±РµРЅРЅРѕ РѕРїР°СЃРµРЅ С‚Р°Рј, РіРґРµ Р±РѕР№ РїСЂРµРІСЂР°С‰Р°РµС‚СЃСЏ РІ С…Р°РѕС‚РёС‡РЅСѓСЋ СЃРёР»РѕРІСѓСЋ СЃС…РІР°С‚РєСѓ."
  },
  {
    slug: "belal-muhammad",
    wikiTitle: "Belal_Muhammad",
    wikiLang: "en",
    nameRu: "Р‘РµР»Р°Р» РњСѓС…Р°РјРјР°Рґ",
    photoUrl: "https://ufc.com/images/2025-11/MUHAMMAD_BELAL_11-22.png",
    bioRu:
      "Р‘РµР»Р°Р» РњСѓС…Р°РјРјР°Рґ вЂ” Р°РјРµСЂРёРєР°РЅСЃРєРёР№ РїРѕР»СѓСЃСЂРµРґРЅРµРІРµСЃ РїР°Р»РµСЃС‚РёРЅСЃРєРѕРіРѕ РїСЂРѕРёСЃС…РѕР¶РґРµРЅРёСЏ, СЃРґРµР»Р°РІС€РёР№ РєР°СЂСЊРµСЂСѓ РЅР° РґРёСЃС†РёРїР»РёРЅРµ, РѕР±СЉРµРјРµ Рё СѓРјРµРЅРёРё РІС‹РёРіСЂС‹РІР°С‚СЊ РґР»РёРЅРЅС‹Рµ С‚Р°РєС‚РёС‡РµСЃРєРёРµ Р±РѕРё. РћРЅ РЅРµ Р·Р°РІРёСЃРёС‚ РѕС‚ РѕРґРЅРѕРіРѕ СЏСЂРєРѕРіРѕ РѕСЂСѓР¶РёСЏ, Р·Р°С‚Рѕ СЃС‚Р°Р±РёР»СЊРЅРѕ СЂР°Р±РѕС‚Р°РµС‚ СЃРµСЂРёСЏРјРё, С…РѕСЂРѕС€Рѕ РєРѕРЅС‚СЂРѕР»РёСЂСѓРµС‚ С‚РµРјРї Рё СЂРµРґРєРѕ РѕС‚РґР°РµС‚ РёРЅРёС†РёР°С‚РёРІСѓ. РРјРµРЅРЅРѕ СЌС‚Р° СЃРёСЃС‚РµРјРЅРѕСЃС‚СЊ РїРѕР·РІРѕР»РёР»Р° РµРјСѓ Р·Р°РєСЂРµРїРёС‚СЊСЃСЏ СЃСЂРµРґРё СЃРёР»СЊРЅРµР№С€РёС… РїРѕР»СѓСЃСЂРµРґРЅРµРІРµСЃРѕРІ РјРёСЂР°."
  },
  {
    slug: "movsar-evloev",
    wikiTitle: "Movsar_Evloev",
    wikiLang: "en",
    nameRu: "РњРѕРІСЃР°СЂ Р•РІР»РѕРµРІ",
    photoUrl: "https://ufc.com/images/2026-03/EVLOEV_MOVSAR_03-21.png",
    bioRu:
      "РњРѕРІСЃР°СЂ Р•РІР»РѕРµРІ вЂ” СЂРѕСЃСЃРёР№СЃРєРёР№ РїРѕР»СѓР»РµРіРєРѕРІРµСЃ, РёР·РІРµСЃС‚РЅС‹Р№ РєР°Рє РєСЂР°Р№РЅРµ РЅРµСѓРґРѕР±РЅС‹Р№ СЃРѕРїРµСЂРЅРёРє СЃ РїР»РѕС‚РЅРѕР№ Р±РѕСЂСЊР±РѕР№ Рё РІС‹СЃРѕРєРёРј Р±РѕР№С†РѕРІСЃРєРёРј IQ. РћРЅ СЂРµРґРєРѕ РїРѕР·РІРѕР»СЏРµС‚ РѕРїРїРѕРЅРµРЅС‚Сѓ СЂР°Р·РІРёС‚СЊ СЃРІРѕСЋ РёРіСЂСѓ Рё РїРѕС‡С‚Рё РІСЃРµРіРґР° РЅР°РІСЏР·С‹РІР°РµС‚ Р±РѕР№ РІ РІС‹РіРѕРґРЅС‹С… РґР»СЏ СЃРµР±СЏ РїРѕР·РёС†РёСЏС…. Р•РІР»РѕРµРІ РёРґРµС‚ РїРѕ РґРёРІРёР·РёРѕРЅСѓ Р·Р° СЃС‡РµС‚ РєРѕРЅС‚СЂРѕР»СЏ, С‚РµРјРїР° Рё СѓРјРµРЅРёСЏ РЅРµ РґРѕРїСѓСЃРєР°С‚СЊ Р»РёС€РЅРµРіРѕ СЂРёСЃРєР°."
  },
  {
    slug: "patchy-mix",
    wikiTitle: "Patchy_Mix",
    wikiLang: "en",
    nameRu: "РџР°С‚С‡Рё РњРёРєСЃ",
    photoUrl: "https://ufc.com/images/2025-10/MIX_PATCHY_10-04.png",
    bioRu:
      "РџР°С‚С‡Рё РњРёРєСЃ вЂ” Р°РјРµСЂРёРєР°РЅСЃРєРёР№ Р±РѕРµС† Р»РµРіС‡Р°Р№С€РµРіРѕ РІРµСЃР°, Р·Р°РєСЂРµРїРёРІС€РёР№СЃСЏ СЃСЂРµРґРё СЃРёР»СЊРЅРµР№С€РёС… Р±РѕР№С†РѕРІ РґРёРІРёР·РёРѕРЅР° Р·Р° СЃС‡РµС‚ С‡РµРјРїРёРѕРЅСЃРєРѕРіРѕ СѓСЂРѕРІРЅСЏ Р±РѕСЂСЊР±С‹ Рё РїРѕР±РµРґ РІ РєСЂСѓРїРЅС‹С… С‚РёС‚СѓР»СЊРЅС‹С… Р±РѕСЏС…. Р•РіРѕ СЃРёР»СЊРЅРµР№С€РµРµ РѕСЂСѓР¶РёРµ вЂ” СЂР°Р±РѕС‚Р° РЅР° СЃРїРёРЅРµ, РєРѕРЅС‚СЂРѕР»СЊ РІ РєР»РёРЅС‡Рµ Рё С†РµРїРєР°СЏ РёРіСЂР° РІ РїР°СЂС‚РµСЂРµ. РњРёРєСЃ РѕРїР°СЃРµРЅ РёРјРµРЅРЅРѕ С‚РµРј, С‡С‚Рѕ СЃРїРѕСЃРѕР±РµРЅ РїСЂРµРІСЂР°С‚РёС‚СЊ Р»СЋР±РѕР№ РѕР±РјРµРЅ РІ СЌРїРёР·РѕРґ РґР»СЏ Р·Р°С…РІР°С‚Р° РёР»Рё РєРѕРЅС‚СЂРѕР»СЏ."
  },
];
const ufcFighterConfigs = fighterConfigs;


const opponentTranslations = {
  "Alexander Volkanovski": "РђР»РµРєСЃР°РЅРґСЂ Р’РѕР»РєР°РЅРѕРІСЃРєРё",
  "Alfie Davis": "РђР»СЊС„Рё Р”СЌРІРёСЃ",
  "Alibeg Rasulov": "РђР»РёР±РµРі Р Р°СЃСѓР»РѕРІ",
  "Aljamain Sterling": "РђР»РґР¶Р°РјРµР№РЅ РЎС‚РµСЂР»РёРЅРі",
  "Arjan Bhullar": "РђСЂРґР¶Р°РЅ Р‘СѓР»Р»Р°СЂ",
  "Arnold Allen": "РђСЂРЅРѕР»СЊРґ РђР»Р»РµРЅ",
  "Brad Wheeler": "Р‘СЂСЌРґ РЈРёР»РµСЂ",
  "Brendan Allen": "Р‘СЂРµРЅРґР°РЅ РђР»Р»РµРЅ",
  "Bryan Battle": "Р‘СЂР°Р№Р°РЅ Р‘СЌС‚С‚Р»",
  "Caio Borralho": "РљР°Р№Рѕ Р‘РѕСЂСЂР°Р»СЊРѕ",
  "Carl Booth": "РљР°СЂР» Р‘СѓС‚",
  "Charles Oliveira": "Р§Р°СЂР»СЊР· РћР»РёРІРµР№СЂР°",
  "Ciryl Gane": "РЎРёСЂРёР» Р“Р°РЅ",
  "Cory Sandhagen": "РљРѕСЂРё РЎСЌРЅРґС…СЌРіРµРЅ",
  "Costello van Steenis": "РљРѕСЃС‚РµР»Р»Рѕ РІР°РЅ РЎС‚РµРЅРёСЃ",
  "Curtis Blaydes": "РљРµСЂС‚РёСЃ Р‘Р»СЌР№РґСЃ",
  "Dustin Poirier": "Р”Р°СЃС‚РёРЅ РџРѕСЂСЊРµ",
  "Fabian Edwards": "Р¤Р°Р±РёР°РЅ Р­РґРІР°СЂРґСЃ",
  "Gael Grimaud": "Р“Р°СЌР»СЊ Р“СЂРёРјРѕ",
  "Geoff Neal": "Р”Р¶РµС„С„ РќРёР»",
  "Ian Machado Garry": "РСЌРЅ Р“СЌСЂСЂРё",
  "Israel Adesanya": "РСЃСЂР°СЌР»СЊ РђРґРµСЃР°РЅСЊСЏ",
  "Jack Della Maddalena": "Р”Р¶РµРє Р”РµР»Р»Р° РњР°РґРґР°Р»РµРЅР°",
  "Jack Grant": "Р”Р¶РµРє Р“СЂР°РЅС‚",
  "Jakub WikЕ‚acz": "РЇРєСѓР± Р’РёРєР»Р°С‡",
  "Jena Bishop": "Р”Р¶РµРЅР° Р‘РёС€РѕРї",
  "Joshua Pacio": "Р”Р¶РѕС€СѓР° РџР°СЃРёРѕ",
  "Khalil Rountree Jr.": "РҐР°Р»РёР» Р Р°СѓРЅС‚СЂРё-РјР»Р°РґС€РёР№",
  "Khamzat Chimaev": "РҐР°РјР·Р°С‚ Р§РёРјР°РµРІ",
  "Kiamrian Abbasov": "РљСЏРјСЂР°РЅ РђР±Р±Р°СЃРѕРІ",
  "Kyoma Akimoto": "РљС‘РјР° РђРєРёРјРѕС‚Рѕ",
  "Leon Edwards": "Р›РµРѕРЅ Р­РґРІР°СЂРґСЃ",
  "Lerone Murphy": "Р›РµСЂРѕРЅ РњС‘СЂС„Рё",
  "Louis Glismann": "Р›СѓРё Р“Р»РёСЃСЃРјР°РЅ",
  "Magomed Ankalaev": "РњР°РіРѕРјРµРґ РђРЅРєР°Р»Р°РµРІ",
  "Mansur Malachiev": "РњР°РЅСЃСѓСЂ РњР°Р»Р°С…РёРµРІ",
  "Mario Bautista": "РњР°СЂРёРѕ Р‘Р°СѓС‚РёСЃС‚Р°",
  "Max Holloway": "РњР°РєСЃ РҐРѕР»Р»РѕСѓСЌР№",
  "Oumar Kane": "РЈРјР°СЂ РљРµР№РЅ",
  "Paul Hughes": "РџРѕР» РҐСЊСЋР·",
  "Petr Yan": "РџРµС‚СЂ РЇРЅ",
  "Rafal Haratyk": "Р Р°С„Р°Р» Р“Р°СЂР°С‚С‹Рє",
  "Reece McLaren": "Р РёСЃ РњР°РєР»Р°СЂРµРЅ",
  "Reinier de Ridder": "Р РµРЅСЊРµ РґРµ Р РёРґРґРµСЂ",
  "Renato Moicano": "Р РµРЅР°С‚Рѕ РњРѕР№РєР°РЅРѕ",
  "Robert Whittaker": "Р РѕР±РµСЂС‚ РЈРёС‚С‚Р°РєРµСЂ",
  "Sean O'Malley": "РЁРѕРЅ Рћ'РњСЌР»Р»Рё",
  "Sean Strickland": "РЁРѕРЅ РЎС‚СЂРёРєР»РµРЅРґ",
  "Sergei Pavlovich": "РЎРµСЂРіРµР№ РџР°РІР»РѕРІРёС‡",
  "Stephen Thompson": "РЎС‚РёРІРµРЅ РўРѕРјРїСЃРѕРЅ",
  "Sumiko Inaba": "РЎСѓРјРёРєРѕ РРЅР°Р±Р°",
  "Taila Santos": "РўР°Р№Р»Р° РЎР°РЅС‚РѕСЃ",
  "Viscardi Andrade": "Р’РёСЃРєР°СЂРґРё РђРЅРґСЂР°РґРµ"
};

const monthMap = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
  janvier: 0,
  fevrier: 1,
  "fГ©vrier": 1,
  mars: 2,
  avril: 3,
  mai: 4,
  juin: 5,
  juillet: 6,
  aout: 7,
  "aoГ»t": 7,
  septembre: 8,
  octobre: 9,
  novembre: 10,
  decembre: 11,
  "dГ©cembre": 11
};

const directMethodMap = {
  "decision (unanimous)": "Р РµС€РµРЅРёРµ СЃСѓРґРµР№ (РµРґРёРЅРѕРіР»Р°СЃРЅРѕРµ)",
  "decision (split)": "Р РµС€РµРЅРёРµ СЃСѓРґРµР№ (СЂР°Р·РґРµР»СЊРЅРѕРµ)",
  "decision (majority)": "Р РµС€РµРЅРёРµ СЃСѓРґРµР№ (Р±РѕР»СЊС€РёРЅСЃС‚РІРѕРј РіРѕР»РѕСЃРѕРІ)",
  "dГ©cision (unanime)": "Р РµС€РµРЅРёРµ СЃСѓРґРµР№ (РµРґРёРЅРѕРіР»Р°СЃРЅРѕРµ)",
  "dГ©cision (partagГ©e)": "Р РµС€РµРЅРёРµ СЃСѓРґРµР№ (СЂР°Р·РґРµР»СЊРЅРѕРµ)",
  "submission (rear-naked choke)": "РЎР°Р±РјРёС€РµРЅ (СѓРґСѓС€РµРЅРёРµ СЃР·Р°РґРё)",
  "submission (brabo choke)": "РЎР°Р±РјРёС€РµРЅ (СѓРґСѓС€РµРЅРёРµ Р±СЂР°Р±Рѕ)",
  "submission (north-south choke)": "РЎР°Р±РјРёС€РµРЅ (СѓРґСѓС€РµРЅРёРµ СЃРµРІРµСЂ-СЋРі)",
  "submission (guillotine choke)": "РЎР°Р±РјРёС€РµРЅ (РіРёР»СЊРѕС‚РёРЅР°)",
  "submission (face crank)": "РЎР°Р±РјРёС€РµРЅ (С„СЌР№СЃ-РєСЂР°РЅРє)",
  "technical submission (rear-naked choke)": "РўРµС…РЅРёС‡РµСЃРєРёР№ СЃР°Р±РјРёС€РµРЅ (СѓРґСѓС€РµРЅРёРµ СЃР·Р°РґРё)",
  "technical submission (north-south choke)": "РўРµС…РЅРёС‡РµСЃРєРёР№ СЃР°Р±РјРёС€РµРЅ (СѓРґСѓС€РµРЅРёРµ СЃРµРІРµСЂ-СЋРі)",
  "ko (punches)": "KO (СѓРґР°СЂС‹)",
  "ko (punch)": "KO (СѓРґР°СЂ)",
  "tko (punches)": "TKO (СѓРґР°СЂС‹)",
  "tko (punches and elbows)": "TKO (СѓРґР°СЂС‹ Рё Р»РѕРєС‚Рё)",
  "tko (elbows and punches)": "TKO (Р»РѕРєС‚Рё Рё СѓРґР°СЂС‹)",
  "tko (knee and punches)": "TKO (РєРѕР»РµРЅРѕ Рё СѓРґР°СЂС‹)",
  "tko (knees)": "TKO (РєРѕР»РµРЅРё)",
  "tko (retirement)": "TKO (РѕС‚РєР°Р· РѕС‚ РїСЂРѕРґРѕР»Р¶РµРЅРёСЏ Р±РѕСЏ)",
  "tko (doctor stoppage)": "TKO (РѕСЃС‚Р°РЅРѕРІРєР° РІСЂР°С‡РѕРј)",
  "tko (corner stoppage)": "TKO (РѕСЃС‚Р°РЅРѕРІРєР° СѓРіР»РѕРј)",
  "tko (front kick to the body and punch)": "TKO (СѓРґР°СЂ РЅРѕРіРѕР№ РїРѕ РєРѕСЂРїСѓСЃСѓ Рё РґРѕР±РёРІР°РЅРёРµ)",
  "tko (punches to the body)": "TKO (СѓРґР°СЂС‹ РїРѕ РєРѕСЂРїСѓСЃСѓ)",
  "tko (punches and soccer kicks)": "TKO (СѓРґР°СЂС‹ Рё СЃРѕРєРєРµСЂ-РєРёРєРё)",
  "nc (accidental eye poke)": "NC (СЃР»СѓС‡Р°Р№РЅС‹Р№ С‚С‹С‡РѕРє РІ РіР»Р°Р·)",
  "nc (eye poke)": "NC (С‚С‹С‡РѕРє РІ РіР»Р°Р·)",
  "soumission (Г©tranglement arriГЁre)": "РЎР°Р±РјРёС€РµРЅ (СѓРґСѓС€РµРЅРёРµ СЃР·Р°РґРё)",
  "soumission (etranglement arriere)": "РЎР°Р±РјРёС€РµРЅ (СѓРґСѓС€РµРЅРёРµ СЃР·Р°РґРё)",
  "soumission (clГ© de talon)": "РЎР°Р±РјРёС€РµРЅ (СЃРєСЂСѓС‡РёРІР°РЅРёРµ РїСЏС‚РєРё)",
  "soumission (cle de talon)": "РЎР°Р±РјРёС€РµРЅ (СЃРєСЂСѓС‡РёРІР°РЅРёРµ РїСЏС‚РєРё)",
  "soumission (guillotine)": "РЎР°Р±РјРёС€РµРЅ (РіРёР»СЊРѕС‚РёРЅР°)"
};

function decodeHtmlEntities(value) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#91;/g, "[")
    .replace(/&#93;/g, "]")
    .replace(/&#39;/g, "'");
}

function stripTags(value) {
  return decodeHtmlEntities(String(value || "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .replace(/\[\d+\]/g, "")
    .trim();
}

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

          response.on("data", (chunk) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          });

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

async function fetchFighterSourceData(config) {
  const summaryUrl = `https://${config.wikiLang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(config.wikiTitle)}`;
  const pageUrl =
    `https://${config.wikiLang}.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(config.wikiTitle)}` +
    "&prop=text&formatversion=2&format=json";

  const [summaryPayload, pagePayload] = await Promise.all([fetchJson(summaryUrl), fetchJson(pageUrl)]);

  return {
    photoUrl: config.photoUrl || summaryPayload.originalimage?.source || summaryPayload.thumbnail?.source || null,
    html: pagePayload.parse?.text || "",
    summary: stripTags(summaryPayload.extract || "")
  };
}

function extractRecentFightRows(html) {
  const headerCandidates = ["<th scope=\"col\">Opponent", "<th scope=\"col\">Adversaire", "<th scope=\"col\">Event", "<th scope=\"col\">Г‰vГ©nement"];
  const headerIndex = headerCandidates.map((candidate) => html.indexOf(candidate)).find((index) => index !== -1) ?? -1;

  if (headerIndex === -1) {
    return [];
  }

  const tableStart = html.lastIndexOf("<table", headerIndex);
  const tableEnd = html.indexOf("</table>", headerIndex);
  if (tableStart === -1 || tableEnd === -1) {
    return [];
  }

  const tableHtml = html.slice(tableStart, tableEnd);
  const rows = [...tableHtml.matchAll(/<tr[\s\S]*?>([\s\S]*?)<\/tr>/g)].map((match) => match[1]);
  const fights = [];

  for (const row of rows.slice(1)) {
    const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((match) => stripTags(match[1]));
    if (cells.length < 6) {
      continue;
    }

    fights.push({
      result: cells[0],
      opponentName: cells[2],
      method: cells[3],
      eventName: cells[4],
      date: cells[5],
      round: cells[6] || null,
      time: cells[7] || null,
      notes: cells[9] || null
    });
  }

  return fights.slice(0, 3);
}

function parseWikiDate(value) {
  const normalized = stripTags(value)
    .toLowerCase()
    .replace(/1er/g, "1")
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const match = normalized.match(/(\d{1,2})\s+([^\s]+)\s+(\d{4})/);
  if (!match) {
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const day = Number(match[1]);
  const month = monthMap[match[2]];
  const year = Number(match[3]);

  if (month == null || Number.isNaN(day) || Number.isNaN(year)) {
    return null;
  }

  return new Date(Date.UTC(year, month, day, 21, 0, 0));
}

function translateResult(result) {
  const normalized = stripTags(result).toLowerCase();

  if (normalized === "win" || normalized === "victoire") {
    return "РџРѕР±РµРґР°";
  }

  if (normalized === "loss" || normalized === "dГ©faite" || normalized === "defaite") {
    return "РџРѕСЂР°Р¶РµРЅРёРµ";
  }

  if (normalized === "draw" || normalized === "Г©galitГ©" || normalized === "egalite") {
    return "РќРёС‡СЊСЏ";
  }

  if (normalized === "nc" || normalized.includes("no contest") || normalized.includes("sans dГ©cision") || normalized.includes("sans decision")) {
    return "РќРµСЃРѕСЃС‚РѕСЏРІС€РёР№СЃСЏ Р±РѕР№";
  }

  return stripTags(result);
}

function translateOpponentName(name) {
  const clean = stripTags(name);
  return opponentTranslations[clean] || clean;
}

function translateMethod(method) {
  const clean = stripTags(method);
  if (!clean) {
    return null;
  }

  const normalized = clean.toLowerCase();
  if (directMethodMap[normalized]) {
    return directMethodMap[normalized];
  }

  return clean
    .replace(/^DГ©cision/i, "Р РµС€РµРЅРёРµ")
    .replace(/^Decision/i, "Р РµС€РµРЅРёРµ")
    .replace(/^Soumission/i, "РЎР°Р±РјРёС€РµРЅ")
    .replace(/^Submission/i, "РЎР°Р±РјРёС€РµРЅ")
    .replace(/^Technical submission/i, "РўРµС…РЅРёС‡РµСЃРєРёР№ СЃР°Р±РјРёС€РµРЅ")
    .replace(/unanimous/gi, "РµРґРёРЅРѕРіР»Р°СЃРЅРѕРµ")
    .replace(/split/gi, "СЂР°Р·РґРµР»СЊРЅРѕРµ")
    .replace(/majority/gi, "Р±РѕР»СЊС€РёРЅСЃС‚РІРѕРј РіРѕР»РѕСЃРѕРІ")
    .replace(/rear-naked choke/gi, "СѓРґСѓС€РµРЅРёРµ СЃР·Р°РґРё")
    .replace(/brabo choke/gi, "СѓРґСѓС€РµРЅРёРµ Р±СЂР°Р±Рѕ")
    .replace(/north-south choke/gi, "СѓРґСѓС€РµРЅРёРµ СЃРµРІРµСЂ-СЋРі")
    .replace(/guillotine choke/gi, "РіРёР»СЊРѕС‚РёРЅР°")
    .replace(/face crank/gi, "С„СЌР№СЃ-РєСЂР°РЅРє")
    .replace(/Г©tranglement arriГЁre/gi, "СѓРґСѓС€РµРЅРёРµ СЃР·Р°РґРё")
    .replace(/etranglement arriere/gi, "СѓРґСѓС€РµРЅРёРµ СЃР·Р°РґРё")
    .replace(/clГ© de talon/gi, "СЃРєСЂСѓС‡РёРІР°РЅРёРµ РїСЏС‚РєРё")
    .replace(/cle de talon/gi, "СЃРєСЂСѓС‡РёРІР°РЅРёРµ РїСЏС‚РєРё")
    .replace(/punches to the body/gi, "СѓРґР°СЂС‹ РїРѕ РєРѕСЂРїСѓСЃСѓ")
    .replace(/soccer kicks/gi, "СЃРѕРєРєРµСЂ-РєРёРєРё")
    .replace(/\band\b/gi, "Рё")
    .replace(/punches/gi, "СѓРґР°СЂС‹")
    .replace(/punch/gi, "СѓРґР°СЂ")
    .replace(/elbows/gi, "Р»РѕРєС‚Рё")
    .replace(/knees/gi, "РєРѕР»РµРЅРё")
    .replace(/knee/gi, "РєРѕР»РµРЅРѕ")
    .replace(/eye poke/gi, "С‚С‹С‡РѕРє РІ РіР»Р°Р·")
    .replace(/\s+/g, " ")
    .trim();
}

function translateChampionshipLabel(value) {
  const labels = {
    "ufc lightweight championship": "С‚РёС‚СѓР» С‡РµРјРїРёРѕРЅР° UFC РІ Р»РµРіРєРѕРј РІРµСЃРµ",
    "ufc featherweight championship": "С‚РёС‚СѓР» С‡РµРјРїРёРѕРЅР° UFC РІ РїРѕР»СѓР»РµРіРєРѕРј РІРµСЃРµ",
    "ufc welterweight championship": "С‚РёС‚СѓР» С‡РµРјРїРёРѕРЅР° UFC РІ РїРѕР»СѓСЃСЂРµРґРЅРµРј РІРµСЃРµ",
    "ufc heavyweight championship": "С‚РёС‚СѓР» С‡РµРјРїРёРѕРЅР° UFC РІ С‚СЏР¶РµР»РѕРј РІРµСЃРµ",
    "ufc bantamweight championship": "С‚РёС‚СѓР» С‡РµРјРїРёРѕРЅР° UFC РІ Р»РµРіС‡Р°Р№С€РµРј РІРµСЃРµ",
    "ufc light heavyweight championship": "С‚РёС‚СѓР» С‡РµРјРїРёРѕРЅР° UFC РІ РїРѕР»СѓС‚СЏР¶РµР»РѕРј РІРµСЃРµ",
    "ufc middleweight championship": "С‚РёС‚СѓР» С‡РµРјРїРёРѕРЅР° UFC РІ СЃСЂРµРґРЅРµРј РІРµСЃРµ"
  };

  return labels[stripTags(value).toLowerCase()] || null;
}

function translateNoteSentence(sentence) {
  const clean = stripTags(sentence).replace(/\s+/g, " ").trim();
  const lower = clean.toLowerCase();

  if (!clean) {
    return null;
  }

  if (lower === "performance of the night") {
    return "РџРѕР»СѓС‡РёР» Р±РѕРЅСѓСЃ В«Р’С‹СЃС‚СѓРїР»РµРЅРёРµ РІРµС‡РµСЂР°В».";
  }

  if (lower === "fight of the night") {
    return "РџРѕР»СѓС‡РёР» Р±РѕРЅСѓСЃ В«Р‘РѕР№ РІРµС‡РµСЂР°В».";
  }

  if (lower.startsWith("won the vacant ")) {
    const label = translateChampionshipLabel(clean.slice("Won the vacant ".length));
    return label ? `Р—Р°РІРѕРµРІР°Р» РІР°РєР°РЅС‚РЅС‹Р№ ${label}.` : null;
  }

  if (lower.startsWith("won the ")) {
    const target = clean.slice("Won the ".length);
    const label = translateChampionshipLabel(target);
    if (label) {
      return `Р—Р°РІРѕРµРІР°Р» ${label}.`;
    }

  }

  if (lower.startsWith("defended the ")) {
    const label = translateChampionshipLabel(clean.slice("Defended the ".length));
    return label ? `Р—Р°С‰РёС‚РёР» ${label}.` : null;
  }

  if (lower.startsWith("lost the ")) {
    const label = translateChampionshipLabel(clean.slice("Lost the ".length));
    return label ? `РџРѕС‚РµСЂСЏР» ${label}.` : null;
  }

  if (lower.includes("semifinal")) {
    return "РџРѕР»СѓС„РёРЅР°Р» С‚СѓСЂРЅРёСЂР°.";
  }

  if (lower.includes("debut")) {
    if (lower.includes("middleweight")) {
      return "Р”РµР±СЋС‚ РІ СЃСЂРµРґРЅРµРј РІРµСЃРµ.";
    }
    if (lower.includes("welterweight")) {
      return "Р”РµР±СЋС‚ РІ РїРѕР»СѓСЃСЂРµРґРЅРµРј РІРµСЃРµ.";
    }
    if (lower.includes("lightweight")) {
      return "Р”РµР±СЋС‚ РІ Р»РµРіРєРѕРј РІРµСЃРµ.";
    }
    if (lower.includes("featherweight")) {
      return "Р”РµР±СЋС‚ РІ РїРѕР»СѓР»РµРіРєРѕРј РІРµСЃРµ.";
    }
  }

  if (lower.includes("accidental eye poke")) {
    return "Р‘РѕР№ Р±С‹Р» РѕСЃС‚Р°РЅРѕРІР»РµРЅ РїРѕСЃР»Рµ СЃР»СѓС‡Р°Р№РЅРѕРіРѕ С‚С‹С‡РєР° РІ РіР»Р°Р·.";
  }

  if (lower.includes("deducted one point")) {
    return "РЎ Р±РѕР№С†Р° СЃРЅСЏР»Рё РѕРґРЅРѕ РѕС‡РєРѕ.";
  }

  if (lower.includes("later vacated the title")) {
    return "РџРѕР·РґРЅРµРµ РѕСЃРІРѕР±РѕРґРёР» С‚РёС‚СѓР».";
  }

  if (lower.includes("broke the record")) {
    return "РЈСЃС‚Р°РЅРѕРІРёР» СЂРµРєРѕСЂРґ РґРёРІРёР·РёРѕРЅР° РїРѕ СѓСЃРїРµС€РЅС‹Рј Р·Р°С‰РёС‚Р°Рј.";
  }

  if (lower.includes("tied for the longest win streak")) {
    return "РџРѕРІС‚РѕСЂРёР» РѕРґРёРЅ РёР· Р»СѓС‡С€РёС… РїРѕР±РµРґРЅС‹С… РѕС‚СЂРµР·РєРѕРІ РІ РёСЃС‚РѕСЂРёРё UFC.";
  }

  return null;
}

function translateNotes(notes, fight) {
  const clean = stripTags(notes);
  if (!clean) {
    return null;
  }

  const translated = clean
    .split(".")
    .map((sentence) => translateNoteSentence(sentence))
    .filter(Boolean);

  const unique = [...new Set(translated)];
  if (unique.length > 0) {
    return unique.join(" ");
  }

  if (fight.result === "РџРѕР±РµРґР°") {
    return "РџРѕР±РµРґР° РІ РїРѕСЃР»РµРґРЅРµРј Р·Р°С„РёРєСЃРёСЂРѕРІР°РЅРЅРѕРј Р±РѕСЋ.";
  }

  if (fight.result === "РџРѕСЂР°Р¶РµРЅРёРµ") {
    return "РџРѕСЂР°Р¶РµРЅРёРµ РІ РїРѕСЃР»РµРґРЅРµРј Р·Р°С„РёРєСЃРёСЂРѕРІР°РЅРЅРѕРј Р±РѕСЋ.";
  }

  if (fight.result === "РќРµСЃРѕСЃС‚РѕСЏРІС€РёР№СЃСЏ Р±РѕР№") {
    return "Р‘РѕР№ Р±С‹Р» РїСЂРёР·РЅР°РЅ РЅРµСЃРѕСЃС‚РѕСЏРІС€РёРјСЃСЏ.";
  }

  return null;
}

async function enrichFighter(config) {
  const fighter = await prisma.fighter.findUnique({
    where: { slug: config.slug }
  });

  if (!fighter) {
    console.log(`Skipped missing fighter: ${config.slug}`);
    return;
  }

  const sourceData = await fetchFighterSourceData(config);
  const recentFights = extractRecentFightRows(sourceData.html);

  await prisma.fighter.update({
    where: { id: fighter.id },
    data: {
      nameRu: config.nameRu,
      photoUrl: sourceData.photoUrl ?? fighter.photoUrl,
      bio: config.bioRu,
      bioEn: sourceData.summary || fighter.bioEn || null
    }
  });

  await prisma.fighterRecentFight.deleteMany({
    where: { fighterId: fighter.id }
  });

  for (const fight of recentFights) {
    const parsedDate = parseWikiDate(fight.date);
    if (!parsedDate) {
      continue;
    }

    const result = translateResult(fight.result);

    await prisma.fighterRecentFight.create({
      data: {
        fighterId: fighter.id,
        opponentName: stripTags(fight.opponentName),
        opponentNameRu: translateOpponentName(fight.opponentName),
        eventName: stripTags(fight.eventName),
        result,
        method: translateMethod(fight.method),
        date: parsedDate,
        round: fight.round ? Number.parseInt(fight.round, 10) || null : null,
        time: fight.time ? stripTags(fight.time) : null,
        weightClass: fighter.weightClass,
        notes: translateNotes(fight.notes, { result })
      }
    });
  }

  console.log(`Enriched fighter: ${fighter.name} -> ${config.nameRu}`);
}

async function main() {
  for (const config of ufcFighterConfigs) {
    try {
      await enrichFighter(config);
    } catch (error) {
      console.error(`Failed to enrich ${config.slug}: ${error.message || error}`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
