<script>
    import profile from '$lib/brand/logotype/logotype-dark-transparent.svg';
</script>

<footer class="bg-base-300 p-4 text-gray-400 sm:p-6">
    <div class="mx-auto max-w-screen-xl">
        <div class="md:flex md:justify-between">
            <div class="mb-6 md:mb-0">
                <a href="/" class="flex items-center">
                    <img src={profile} alt="BastiDood" loading="lazy" class="mr-3 max-w-48" />
                </a>
            </div>
            <div class="grid grid-cols-3 gap-8 sm:gap-6">
                <div>
                    <h2 class="text-base-content mb-4 text-sm font-semibold uppercase">Sitemap</h2>
                    <ul class="space-y-2 text-gray-400">
                        <li><a href="/" class="hover:underline">Home</a></li>
                        <li><a href="/guide/" class="hover:underline">Guide</a></li>
                        <li><a href="/reference/" class="hover:underline">Reference</a></li>
                    </ul>
                </div>
                <div>
                    <h2 class="text-base-content mb-4 text-sm font-semibold uppercase">Code</h2>
                    <ul class="space-y-2 text-gray-400">
                        <li>
                            <a target="_blank" href="https://github.com/BastiDood/spectro" class="hover:underline"
                                >Repository</a
                            >
                        </li>
                        <li>
                            <a
                                target="_blank"
                                href="https://github.com/BastiDood/spectro/blob/main/LICENSE"
                                class="hover:underline">License</a
                            >
                        </li>
                        <li>
                            <a
                                target="_blank"
                                href="https://github.com/BastiDood/spectro/blob/main/COPYING.md"
                                class="hover:underline">External Assets</a
                            >
                        </li>
                    </ul>
                </div>
                <div>
                    <h2 class="text-base-content mb-4 text-sm font-semibold uppercase">Legal</h2>
                    <ul class="space-y-2 text-gray-400">
                        <li><a href="/privacy/" class="hover:underline">Privacy Policy</a></li>
                    </ul>
                </div>
            </div>
        </div>
        <hr class="my-6 border-gray-700 sm:mx-auto lg:my-8" />
        <p class="text-sm text-gray-400">
            Coded with ❤️ by <a
                rel="external"
                target="_blank"
                href="https://bastidood.github.io/"
                class="link link-primary">Basti Ortiz</a
            >. Themes, branding, and design by
            <a rel="external" target="_blank" href="https://github.com/Anjellyrika" class="link link-primary"
                >Jelly Raborar</a
            >.
        </p>
    </div>
</footer>
