<script>
    import './app.css';
    const { children } = $props();

    import GitHub from '@iconify/icons-simple-icons/github';
    import Icon from '@iconify/svelte';
    import LogoMark from '$lib/brand/logomark/logomark.svg';
</script>

<header class="sticky top-0 bg-base-100 p-1 pl-4 pr-10 shadow-sm">
    <nav class="navbar">
        <div class="navbar-start">
            <a href="/">
                <img src={LogoMark} alt="Spectro logo" class="w-12" />
            </a>
        </div>
        <div class="navbar-end">
            <a href="https://github.com/BastiDood/spectro">
                <Icon icon={GitHub} width="32" />
            </a>
        </div>
    </nav>
</header>

{@render children()}
