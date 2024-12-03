<script>
    import './app.css';
    const { children } = $props();

    import LogoMark from '$lib/brand/logomark/logomark.svg';
</script>

<header class="p-2 pr-10">
    <nav class="navbar">
        <div class="navbar-start">
            <a href="/">
                <img src={LogoMark} alt="Spectro logo" class="w-12" />
            </a>
        </div>
        <div class="navbar-end flex flex-row gap-8">
            <a href="/docs/" class="link link-hover">Docs</a>
            <a href="https://github.com/BastiDood/spectro" class="link link-hover">GitHub</a>
        </div>
    </nav>
</header>

{@render children()}
