<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\OrderController;
use Illuminate\Support\Facades\Route;

Route::post('/login', [AuthController::class, 'login']);

Route::middleware(['auth:sanctum'])->group(function () {
    Route::get('/orders', [OrderController::class, 'index']);
    Route::post('/orders', [OrderController::class, 'store']);
    Route::get('/orders/{id}', [OrderController::class, 'show']);
});

Route::prefix('admin')->middleware(['auth:sanctum', 'role:admin'])->group(function () {
    Route::delete('/orders/{id}', [OrderController::class, 'destroy']);
});
