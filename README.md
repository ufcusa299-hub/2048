# Merge Grid

لعبة ألغاز 4×4 مستوحاة من ميكانيكية الدمج، بهوية بصرية وتنفيذ مستقلين.

## طريقة التشغيل (PHASE 1)

1. تأكد من تثبيت Flutter SDK:
   ```
   flutter doctor
   ```
2. من داخل مجلد المشروع:
   ```
   flutter pub get
   flutter run
   ```
3. يجب أن تظهر شاشة تحمل عنوان "Merge Grid" ونص "PHASE 1: Project Setup ✅".
   هذا يؤكد أن المشروع، الـ Theme، والألوان المركزية تعمل بشكل صحيح.

## بنية المشروع الحالية

```
lib/
  main.dart                        نقطة الدخول (شاشة تحقق مؤقتة)
  core/
    theme/
      app_colors.dart              نظام الألوان المركزي (عدّل هنا لتغيير الهوية البصرية)
      app_theme.dart                بناء ThemeData الفاتح/الداكن من app_colors
    constants/
      game_constants.dart          ثوابت منطق اللعبة (حجم اللوحة، احتمالات التوليد، Swipe)
      ui_constants.dart            ثوابت الواجهة (مسافات، زوايا، مدد Animations)
```

المجلدات التالية أُنشئت فارغة تحضيرًا للمراحل القادمة:
`game/engine`, `game/models`, `state`, `screens/*`, `widgets`, `services`, `test`.
