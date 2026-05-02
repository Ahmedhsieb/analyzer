<?php

use Ahmedhsieb\Analyzer\Analysis\ControllerAnalyzer;
use Ahmedhsieb\Analyzer\Analysis\MethodTracer;
use Ahmedhsieb\Analyzer\Analysis\MiddlewareRegistry;
use Ahmedhsieb\Analyzer\Analysis\ModelAnalyzer;
use Ahmedhsieb\Analyzer\Analysis\RouteAnalyzer;
use Ahmedhsieb\Analyzer\Graph\GraphBuilder;

$fixtureProject = __DIR__.'/../fixtures/laravel-project';

it('builds a graph with nodes and edges from fixture project', function () use ($fixtureProject) {
    $routes = (new RouteAnalyzer)->analyze($fixtureProject);
    $middlewareRegistry = new MiddlewareRegistry([], [], []);
    $controllers = (new ControllerAnalyzer)->analyze($fixtureProject, $routes);
    $traces = (new MethodTracer)->trace($controllers);
    $modelFqcns = array_map(fn ($t) => $t->calleeFqcn, array_filter($traces, fn ($t) => $t->type === 'model'));
    $models = (new ModelAnalyzer)->analyze($fixtureProject, $modelFqcns);

    $graph = (new GraphBuilder)->build('test', $routes, $middlewareRegistry, $controllers, $traces, $models);

    expect($graph->nodeCount())->toBeGreaterThan(0);
    expect($graph->edgeCount())->toBeGreaterThan(0);
});

it('produces valid JSON output', function () use ($fixtureProject) {
    $routes = (new RouteAnalyzer)->analyze($fixtureProject);
    $middlewareRegistry = new MiddlewareRegistry([], [], []);
    $controllers = (new ControllerAnalyzer)->analyze($fixtureProject, $routes);
    $traces = (new MethodTracer)->trace($controllers);

    $modelFqcns = array_map(fn ($t) => $t->calleeFqcn, array_filter($traces, fn ($t) => $t->type === 'model'));
    $models = (new ModelAnalyzer)->analyze($fixtureProject, $modelFqcns);

    $graph = (new GraphBuilder)->build('test', $routes, $middlewareRegistry, $controllers, $traces, $models);
    $json = $graph->toJson();
    $decoded = json_decode($json, true);

    expect($decoded)->toHaveKey('meta');
    expect($decoded)->toHaveKey('nodes');
    expect($decoded)->toHaveKey('edges');
    expect($decoded['meta'])->toHaveKey('project');
    expect($decoded['nodes'])->toBeArray();
    expect($decoded['edges'])->toBeArray();
});

it('creates route nodes for each route', function () use ($fixtureProject) {
    $routes = (new RouteAnalyzer)->analyze($fixtureProject);
    $middlewareRegistry = new MiddlewareRegistry([], [], []);
    $controllers = (new ControllerAnalyzer)->analyze($fixtureProject, $routes);
    $traces = (new MethodTracer)->trace($controllers);
    $models = [];

    $graph = (new GraphBuilder)->build('test', $routes, $middlewareRegistry, $controllers, $traces, $models);

    $routeNodes = array_filter($graph->nodes(), fn ($n) => $n->type === 'route');
    expect(count($routeNodes))->toBe(count($routes));
});




