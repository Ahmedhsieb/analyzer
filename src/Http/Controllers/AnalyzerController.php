<?php

declare(strict_types=1);

namespace Ahmedhsieb\Analyzer\Http\Controllers;

use Ahmedhsieb\Analyzer\Analysis\ProjectAnalyzer;
use Ahmedhsieb\Analyzer\Security\AnalyzerAuthManager;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Routing\Controller;

class AnalyzerController extends Controller
{
    public function favicon(): Response
    {
        $filePath = $this->packageAssetPath('favicon.svg');
        if ($filePath && file_exists($filePath) && is_file($filePath)) {
            return $this->serveFile($filePath);
        }

        return response('', 404);
    }

    public function loginPage(Request $request): Response|RedirectResponse
    {
        if ($request->session()->get('analyzer_authenticated') === true) {
            return redirect('/_analyzer');
        }

        $manager = new AnalyzerAuthManager;

        return response()->view('analyzer::login', [
            'configured' => $manager->isConfigured(),
            'username' => $manager->username(),
        ]);
    }

    public function login(Request $request): RedirectResponse
    {
        $manager = new AnalyzerAuthManager;
        if (! $manager->isConfigured()) {
            return redirect('/_analyzer/login')->with('error', 'Analyzer auth is not configured. Run: php artisan analyzer:setup-auth');
        }

        $username = trim((string) $request->input('username', ''));
        $password = (string) $request->input('password', '');

        if (! $manager->verify($username, $password)) {
            return redirect('/_analyzer/login')->with('error', 'Invalid username or password.');
        }

        $request->session()->regenerate();
        $request->session()->put('analyzer_authenticated', true);

        return redirect('/_analyzer');
    }

    public function logout(Request $request): RedirectResponse
    {
        $request->session()->forget('analyzer_authenticated');
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return redirect('/_analyzer/login');
    }

    public function source(Request $request): JsonResponse
    {
        $filePath = $request->query('path', '');

        if (! $filePath || ! file_exists($filePath) || pathinfo($filePath, PATHINFO_EXTENSION) !== 'php') {
            return response()->json(['error' => 'File not found'], 404);
        }

        return response()->json(['content' => file_get_contents($filePath)]);
    }

    public function scan(Request $request): JsonResponse
    {
        ini_set('memory_limit', '1024M');
        set_time_limit(300);

        $projectPath = base_path();
        $analyzer = new ProjectAnalyzer;

        ob_start();
        $result = $analyzer->analyze($projectPath);
        ob_end_clean();

        $storageDir = storage_path('app/analyzer');
        if (! is_dir($storageDir)) {
            mkdir($storageDir, 0755, true);
        }

        file_put_contents($storageDir.'/.graph-manifest.json', $result->manifestJson);
        file_put_contents($storageDir.'/.graph-all.json', $result->fullGraph->toJson());

        foreach ($result->subgraphs as $tabId => $subgraph) {
            file_put_contents($storageDir."/.graph-{$tabId}.json", $subgraph->toJson());
        }

        return response()->json([
            'success' => true,
            'message' => 'Project scan completed successfully.',
            'analyzedAt' => $result->analyzedAt,
        ]);
    }

    public function serve(Request $request, string $any = ''): Response|JsonResponse
    {
        $any = ltrim($any, '/');

        if (preg_match('/^\.graph-[a-z0-9_-]+\.json$/', $any)) {
            $path = storage_path('app/analyzer/'.$any);
            if (! file_exists($path)) {
                return response()->json(
                    ['error' => 'No scan data found. Run php artisan analyzer:analyze first.'],
                    404
                );
            }

            return response(file_get_contents($path), 200, ['Content-Type' => 'application/json']);
        }

        if ($any !== '') {
            $filePath = $this->packageAssetPath($any);
            if ($filePath && file_exists($filePath) && is_file($filePath)) {
                return $this->serveFile($filePath);
            }
        }

        return response()->view('analyzer::index');
    }

    private function serveFile(string $filePath): Response
    {
        $mimes = [
            'js' => 'application/javascript',
            'css' => 'text/css',
            'svg' => 'image/svg+xml',
            'png' => 'image/png',
            'ico' => 'image/x-icon',
            'json' => 'application/json',
            'html' => 'text/html',
            'woff2' => 'font/woff2',
            'woff' => 'font/woff',
        ];
        $ext = strtolower(pathinfo($filePath, PATHINFO_EXTENSION));
        $mime = $mimes[$ext] ?? 'application/octet-stream';

        return response(file_get_contents($filePath), 200, ['Content-Type' => $mime]);
    }

    private function packageAssetPath(string $file = ''): string
    {
        $base = realpath(__DIR__.'/../../../resources/assets');
        if (! $base) {
            return '';
        }

        $full = $base.($file !== '' ? '/'.ltrim($file, '/') : '');
        $realFull = realpath($full);

        if (! $realFull) {
            return '';
        }

        $baseWithSlash = rtrim($base, DIRECTORY_SEPARATOR).DIRECTORY_SEPARATOR;

        if ($realFull === $base || str_starts_with($realFull, $baseWithSlash)) {
            return $realFull;
        }

        return '';
    }
}





