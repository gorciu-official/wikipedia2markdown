all:
	rm -rf results
	deno task test
	deno task start