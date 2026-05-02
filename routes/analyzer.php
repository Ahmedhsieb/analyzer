<?php

use Illuminate\Support\Facades\Route;
use Ahmedhsieb\Analyzer\Http\Controllers\AnalyzerController;

Route::prefix('_analyzer')->group(function () {
    Route::get('/api/source', [AnalyzerController::class, 'source']);
    Route::post('/api/scan', [AnalyzerController::class, 'scan']);
    Route::get('/{any?}', [AnalyzerController::class, 'serve'])->where('any', '.*');
});





