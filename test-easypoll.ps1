param(
    [Parameter(Mandatory)]
    [ValidatePattern('^[A-Za-z0-9_-]+$')]
    [string]$PollId
)

$envPath = Join-Path $PSScriptRoot ".env"

if (-not (Test-Path -LiteralPath $envPath)) {
    throw "Missing .env file at '$envPath'."
}

$envContent = [System.IO.File]::ReadAllText($envPath)
if ($envContent -notmatch '(?m)^EASYPOLL_API_KEY\s*=\s*[''\"]?([A-Za-z0-9_-]+)[''\"]?\s*$') {
    throw "Add EASYPOLL_API_KEY=your-key to .env using only the key returned by EasyPoll."
}

$apiKey = $Matches[1]

if ([string]::IsNullOrWhiteSpace($apiKey)) {
    throw "EASYPOLL_API_KEY is empty in .env."
}

if ($apiKey -notmatch '^[A-Za-z0-9_-]+$') {
    throw "EASYPOLL_API_KEY contains an invalid character."
}

$headers = @{ Authorization = "Bearer $apiKey" }

try {
    $resolvedPollId = $PollId

    if ($PollId -notmatch '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$') {
        $guilds = Invoke-RestMethod -Method Get -Uri "https://easypoll.com/api/v1/users/@me/guilds" -Headers $headers
        $matches = foreach ($guild in $guilds) {
            if (-not $guild.hasBot -or (-not $guild.hasAccess -and -not $guild.maybeHasAccess)) {
                continue
            }

            $pollsUri = "https://easypoll.com/api/v1/guilds/$($guild.id)/polls?limit=100"
            $polls = Invoke-RestMethod -Method Get -Uri $pollsUri -Headers $headers
            $polls.data | Where-Object {
                $_.id -eq $PollId -or
                $_.id.StartsWith("$PollId-", [StringComparison]::OrdinalIgnoreCase) -or
                $_.messageId -eq $PollId
            }
        }

        $matches = @($matches)
        if ($matches.Count -eq 0) {
            throw "No EasyPoll poll matched short ID or Discord message ID '$PollId'."
        }
        if ($matches.Count -gt 1) {
            throw "More than one EasyPoll poll matched '$PollId'. Use its Discord message ID instead."
        }

        $resolvedPollId = $matches[0].id
        Write-Host "Resolved $PollId to API poll ID $resolvedPollId"
    }

    $uri = "https://easypoll.com/api/v1/polls/$resolvedPollId/votes"
    $response = Invoke-RestMethod -Method Get -Uri $uri -Headers $headers
    $response | ConvertTo-Json -Depth 10
}
catch {
    $statusCode = [int]$_.Exception.Response.StatusCode

    switch ($statusCode) {
        400 { Write-Error "EasyPoll rejected the resolved poll ID as invalid (400 Bad Request)." }
        401 { Write-Error "EasyPoll rejected the API key (401 Unauthorized)." }
        403 { Write-Error "The API-key owner lacks LIST_POLL_VOTES for this server (403 Forbidden)." }
        404 { Write-Error "EasyPoll could not find or expose poll '$PollId' (404 Not Found)." }
        default { throw }
    }
}
finally {
    $apiKey = $null
    $headers = $null
}
