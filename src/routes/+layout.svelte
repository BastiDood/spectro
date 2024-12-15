<script>
    import './app.css';
    import { ORIGIN } from '$lib/server/env/svelte';

    import banner from '$lib/brand/link-preview.png?url';
    import favicon from '$lib/brand/favicon.ico?url';

    import GitHub from '@iconify/icons-simple-icons/github';
    import Icon from '@iconify/svelte';
    import Spectro from '$lib/brand/logomark/48-logomark.png';

    import NavLink from './NavLink.svelte';

    const { children } = $props();
</script>

<svelte:head>
    <link rel="icon" href={favicon} />
    <meta property="og:image" content="{ORIGIN.origin}{banner}" />
</svelte:head>

<div class="flex h-screen flex-col">
    <header class="sticky top-0 z-10">
        <nav class="navbar h-20 bg-base-200 p-4 shadow-sm lg:pr-10">
            <div class="navbar-start">
                <a href="/"><img src={Spectro} alt="Spectro logo" class="w-12" /></a>
                <ul class="menu menu-horizontal">
                    <li><NavLink href="/guides/">Guides</NavLink></li>
                    <li><NavLink href="/reference/">Reference</NavLink></li>
                </ul>
            </div>
            <div class="navbar-end">
                <a rel="external" target="_blank" href="https://github.com/BastiDood/spectro"
                    ><Icon icon={GitHub} width="32" /></a
                >
            </div>
        </nav>
    </header>
    <main class="flex min-h-0 grow justify-center">{@render children()}</main>
</div>
