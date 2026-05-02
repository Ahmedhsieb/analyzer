<?php

declare(strict_types=1);

namespace Ahmedhsieb\Analyzer;

use Ahmedhsieb\Analyzer\Commands\ChangeAuthCommand;
use Ahmedhsieb\Analyzer\Commands\ScanCommand;
use Ahmedhsieb\Analyzer\Commands\SetupAuthCommand;
use Illuminate\Support\ServiceProvider;

class AnalyzerServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        // Only register routes and commands in local environment for security
        if (! $this->app->isLocal()) {
            return;
        }

        $this->loadViewsFrom(__DIR__.'/../resources/views', 'analyzer');
        $this->commands([ScanCommand::class, SetupAuthCommand::class, ChangeAuthCommand::class]);
        $this->loadRoutesFrom(__DIR__.'/../routes/analyzer.php');
    }
}





