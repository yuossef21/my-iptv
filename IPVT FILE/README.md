# IPTV PRO - Senior Edition

تطبيق IPTV متقدم مع دعم كامل للبث المباشر والأفلام والمسلسلات.

## المميزات

✅ **بروكسي متقدم** - تجاوز CORS تلقائياً
✅ **دعم 4K/HEVC** - مع fallback تلقائي
✅ **محركات متعددة** - Hls.js, Video.js, Direct
✅ **بحث شامل** - في جميع القنوات والمحتوى
✅ **واجهة عربية** - RTL كاملة

## متطلبات التشغيل

- **PHP 7.4+** مع cURL extension
- متصفح حديث (Chrome, Edge, Firefox)

## طريقة التشغيل

### 1. تثبيت PHP (إذا لم يكن مثبتاً)

**الطريقة الأولى - PHP Standalone:**
- حمّل من: https://windows.php.net/download/
- اختر "VS16 x64 Thread Safe"
- فك الضغط في `C:\php`
- أضف `C:\php` إلى PATH

**الطريقة الثانية - XAMPP (أسهل):**
- حمّل من: https://www.apachefriends.org/
- ثبّت XAMPP
- PHP سيكون في `C:\xampp\php`

### 2. تشغيل السيرفر

**Windows:**
```bash
# انقر مرتين على
start.bat
```

**أو يدوياً:**
```bash
php -S localhost:8000
```

### 3. فتح التطبيق

افتح المتصفح على: **http://localhost:8000**

## البنية التقنية

```
├── index.html      # الواجهة الرئيسية
├── style.css       # التصميم
├── api.js          # XtreamAPI wrapper
├── app.js          # المنطق الرئيسي + المشغل
├── proxy.php       # CORS proxy + stream optimizer
└── start.bat       # تشغيل سريع
```

## استخدام البروكسي

البروكسي يعمل تلقائياً لـ:
- طلبات API (categories, streams, series info)
- Fallback للستريمات عند فشل الاتصال المباشر
- معالجة ملفات m3u8 وتحويل الروابط النسبية

## المحركات المتاحة

1. **⚡ Hls.js** - موصى به للبث المباشر (Live TV)
2. **🎬 Video.js** - للبث المتقدم مع VHS
3. **🔗 مباشر** - للأفلام والمسلسلات (VOD)
4. **🔴 HEVC Fallback** - لحل مشاكل 4K/H.265

## استكشاف الأخطاء

### البروكسي لا يعمل
- تأكد من تشغيل PHP server
- تحقق من تفعيل cURL extension في php.ini

### الفيديو لا يعمل
- جرب تغيير المحرك من القائمة
- للمحتوى 4K: استخدم Edge أو Safari (دعم H.265)

### CORS errors
- البروكسي يحل المشكلة تلقائياً
- أو فعّل إضافة "Allow CORS" في المتصفح

## الأمان

⚠️ هذا البروكسي للاستخدام المحلي فقط
- لا ترفعه على سيرفر عام بدون حماية
- يُنصح بإضافة whitelist للدومينات المسموحة

---

**Built with ❤️ for IPTV enthusiasts**
