<?php

use Ahmedhsieb\Analyzer\Http\Controllers\AnalyzerController;
use Ahmedhsieb\Analyzer\Http\Middleware\EnsureAnalyzerAuthenticated;
use Illuminate\Support\Facades\Route;

Route::prefix('_analyzer')->middleware('web')->group(function () {
    Route::get('/favicon.svg', [AnalyzerController::class, 'favicon'])->name('analyzer.favicon');
    Route::get('/login', [AnalyzerController::class, 'loginPage'])->name('analyzer.login');
    Route::post('/login', [AnalyzerController::class, 'login'])->name('analyzer.login.submit');
    Route::post('/logout', [AnalyzerController::class, 'logout'])->name('analyzer.logout');

    Route::middleware([EnsureAnalyzerAuthenticated::class])->group(function () {
        Route::get('/api/source', [AnalyzerController::class, 'source']);
        Route::post('/api/scan', [AnalyzerController::class, 'scan']);
        Route::get('/{any?}', [AnalyzerController::class, 'serve'])->where('any', '.*');
    });
});

