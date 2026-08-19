import UIKit
import Capacitor

/// Registers local plugins and locks portrait orientation.
@objc(BridgeViewController)
final class BridgeViewController: CAPBridgeViewController {
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask {
        .portrait
    }

    override var preferredInterfaceOrientationForPresentation: UIInterfaceOrientation {
        .portrait
    }

    override var shouldAutorotate: Bool {
        false
    }

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(AdvancedHapticsPlugin())
        CAPLog.print("⚡️ AdvancedHapticsPlugin registered")
        lockWebGestures()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        lockWebGestures()
    }

    /// Kill WKWebView chrome: pinch, double-tap zoom, bounce, back-swipe.
    private func lockWebGestures() {
        guard let webView else { return }
        webView.allowsBackForwardNavigationGestures = false
        webView.allowsLinkPreview = false
        let scroll = webView.scrollView
        scroll.isScrollEnabled = false
        scroll.bounces = false
        scroll.alwaysBounceVertical = false
        scroll.alwaysBounceHorizontal = false
        scroll.pinchGestureRecognizer?.isEnabled = false
        for gesture in scroll.gestureRecognizers ?? [] {
            if let tap = gesture as? UITapGestureRecognizer, tap.numberOfTapsRequired == 2 {
                tap.isEnabled = false
            }
        }
    }
}
