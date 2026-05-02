<?php

declare(strict_types=1);

namespace Ahmedhsieb\Analyzer\Http\Middleware;

use Ahmedhsieb\Analyzer\Security\AnalyzerAuthManager;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureAnalyzerAuthenticated
{
    public function handle(Request $request, Closure $next): Response
    {
        $manager = new AnalyzerAuthManager;

        if (! $manager->isConfigured()) {
            return response(
                'Analyzer authentication is not configured. Run: php artisan analyzer:setup-auth',
                503
            );
        }

        if ($request->session()->get('analyzer_authenticated') === true) {
            return $next($request);
        }

        return redirect()->guest(url('/_analyzer/login'));
    }
}

