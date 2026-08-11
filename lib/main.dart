import 'package:flutter/material.dart';
import 'core/theme/app_theme.dart';

void main() {
  runApp(const MergeGridApp());
}

/// نقطة الدخول الرئيسية للتطبيق.
///
/// في هذه المرحلة (PHASE 1) هذا مجرد Shell للتحقق من أن:
/// - المشروع يُبنى بدون أخطاء.
/// - نظام الألوان (Theme) يعمل.
/// الشاشات الفعلية (Splash / Home / Game) ستُضاف في PHASE 2 و 3.
class MergeGridApp extends StatelessWidget {
  const MergeGridApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Merge Grid',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      themeMode: ThemeMode.system,
      home: const _SetupCheckScreen(),
    );
  }
}

/// شاشة مؤقتة فقط للتأكد بصريًا من أن الإعداد الأساسي (Theme + Fonts)
/// يعمل بشكل صحيح. سيتم استبدالها بالكامل في PHASE 2.
class _SetupCheckScreen extends StatelessWidget {
  const _SetupCheckScreen();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('Merge Grid', style: theme.textTheme.headlineMedium),
            const SizedBox(height: 8),
            Text(
              'PHASE 1: Project Setup ✅',
              style: theme.textTheme.bodyMedium,
            ),
          ],
        ),
      ),
    );
  }
}
