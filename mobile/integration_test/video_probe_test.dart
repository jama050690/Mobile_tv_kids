// Vaqtinchalik diagnostika: simulyatorda AVPlayer qaysi URL'larni ochadi
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:video_player/video_player.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets('probe', (t) async {
    const urls = [
      'https://flutter.github.io/assets-for-api-docs/assets/videos/bee.mp4',
      'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
      'https://storage.googleapis.com/shaka-demo-assets/angel-one-hls/hls.m3u8',
    ];
    for (final u in urls) {
      final vc = VideoPlayerController.networkUrl(Uri.parse(u));
      final sw = Stopwatch()..start();
      try {
        await t.runAsync(() => vc.initialize().timeout(const Duration(seconds: 25)));
        print('PROBE OK ${sw.elapsed.inMilliseconds}ms dur=${vc.value.duration} $u');
      } catch (e) {
        print('PROBE FAIL $e err=${vc.value.errorDescription} $u');
      }
      await vc.dispose();
    }
  });
}
