<script>
    import './app.css';

    import GitHub from '@iconify/icons-simple-icons/github';
    import Icon from '@iconify/svelte';
    import LogoMark from '$lib/brand/logomark/48-logomark.png';
    import banner from '$lib/brand/link-preview.png?url';
    import favicon from '$lib/brand/favicon.ico?url';

    const { children } = $props();
</script>

<svelte:head>
    <link rel="icon" href={favicon} />
    <meta property="og:image" content="https://spectro.fly.dev{banner}" />
</svelte:head>

<div class="flex h-screen flex-col">
    <header class="sticky top-0 z-10">
        <nav class="navbar h-20 bg-base-200 p-4 shadow-sm lg:pr-10">
            <div class="navbar-start">
                <a href="/">
                    <img src={LogoMark} alt="Spectro logo" class="w-12" />
                </a>
            </div>
            <div class="navbar-end">
                <a rel="external" href="https://github.com/BastiDood/spectro">
                    <Icon icon={GitHub} width="32" />
                </a>
            </div>
        </nav>
    </header>
    <main class="flex min-h-0 grow justify-center">
        {@render children()}
    </main>
</div>
