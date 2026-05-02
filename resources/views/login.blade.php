<!doctype html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="csrf-token" content="{{ csrf_token() }}" />
    <title>Analyzer Login</title>
    <link rel="icon" type="image/svg+xml" href="{{ url('/_analyzer/favicon.svg') }}" />
    <style>
        :root {
            color-scheme: dark;
        }
        body {
            margin: 0;
            min-height: 100vh;
            font-family: "Segoe UI", Tahoma, sans-serif;
            background: radial-gradient(circle at top, #18243f 0%, #0b1020 55%, #070b16 100%);
            color: #e8f0ff;
            display: grid;
            place-items: center;
            padding: 20px;
        }
        .card {
            width: 100%;
            max-width: 420px;
            border: 1px solid rgba(148, 163, 184, 0.28);
            background: rgba(13, 19, 34, 0.9);
            border-radius: 14px;
            box-shadow: 0 18px 50px rgba(0, 0, 0, 0.4);
            padding: 24px;
        }
        .brand {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 12px;
        }
        .brand img {
            width: 42px;
            height: 42px;
            border-radius: 10px;
            border: 1px solid rgba(148, 163, 184, 0.25);
            background: #0a1227;
        }
        .brand .txt {
            display: flex;
            flex-direction: column;
            line-height: 1.15;
        }
        .brand .txt strong {
            font-size: 18px;
            letter-spacing: 0.01em;
        }
        .brand .txt span {
            font-size: 11px;
            color: #91a7cb;
            text-transform: uppercase;
            letter-spacing: 0.08em;
        }
        h1 {
            margin: 0 0 6px;
            font-size: 24px;
        }
        p {
            margin: 0 0 18px;
            color: #9cb0d2;
            font-size: 13px;
        }
        .error {
            margin-bottom: 12px;
            border: 1px solid rgba(244, 63, 94, 0.5);
            background: rgba(244, 63, 94, 0.12);
            border-radius: 8px;
            padding: 10px 12px;
            color: #ffb8c7;
            font-size: 13px;
        }
        label {
            display: block;
            font-size: 12px;
            color: #b8c9e6;
            margin: 10px 0 6px;
        }
        input {
            width: 100%;
            box-sizing: border-box;
            height: 40px;
            border-radius: 8px;
            border: 1px solid rgba(148, 163, 184, 0.35);
            background: #101b33;
            color: #e8f0ff;
            padding: 0 10px;
            outline: none;
        }
        input:focus {
            border-color: #4cc9f0;
            box-shadow: 0 0 0 3px rgba(76, 201, 240, 0.18);
        }
        button {
            width: 100%;
            height: 42px;
            margin-top: 16px;
            border: none;
            border-radius: 9px;
            background: linear-gradient(135deg, #2f7cff, #22c1c3);
            color: #fff;
            font-weight: 700;
            cursor: pointer;
        }
        button:hover {
            filter: brightness(1.06);
        }
        .hint {
            margin-top: 12px;
            color: #8da2c6;
            font-size: 12px;
        }
        code {
            color: #c5d9ff;
        }
    </style>
</head>
<body>
    <div class="card">
        <div class="brand">
            <img src="{{ url('/_analyzer/favicon.svg') }}" alt="Analyzer icon" />
            <div class="txt">
                <strong>Analyzer</strong>
                <span>Secure Access</span>
            </div>
        </div>
        <h1>Login</h1>
        <p>Sign in to access Analyzer viewer and scan endpoints.</p>

        @if (session('error'))
            <div class="error">{{ session('error') }}</div>
        @endif

        @if (! $configured)
            <div class="error">
                Authentication is not configured.
                Run <code>php artisan analyzer:setup-auth</code>
            </div>
        @endif

        <form method="POST" action="{{ url('/_analyzer/login') }}">
            @csrf
            <label for="username">Username</label>
            <input id="username" name="username" type="text" value="{{ old('username', $username ?? '') }}" required />

            <label for="password">Password</label>
            <input id="password" name="password" type="password" required />

            <button type="submit">Login</button>
        </form>

        <div class="hint">URL: <code>{{ url('/_analyzer') }}</code></div>
    </div>
</body>
</html>
