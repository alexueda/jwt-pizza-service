#!/bin/bash

host=$1
if [ -z "$host" ]; then
  echo "Usage: ./generatePizzaTraffic.sh <server_url>"
  exit 1
fi

# Kill all background processes when script exits
trap "trap - SIGTERM && kill -- -$$" SIGINT SIGTERM EXIT

# Request the menu every 3 seconds
while true; do
  curl -s $host/api/order/menu
  sleep 3
done &

# Simulate an invalid login every 25 seconds
while true; do
  curl -s -X PUT $host/api/auth -d '{"email":"unknown@jwt.com", "password":"bad"}' -H 'Content-Type: application/json'
  sleep 25
done &

# Simulate a franchisee logging in and out
while true; do
  response=$(curl -s -X PUT $host/api/auth -d '{"email":"f@jwt.com", "password":"franchisee"}' -H 'Content-Type: application/json')
  token=$(echo $response | jq -r '.token')
  sleep 110
  curl -X DELETE $host/api/auth -H "Authorization: Bearer $token"
  sleep 10
done &

# Simulate a diner ordering a pizza every 20 seconds
while true; do
  response=$(curl -s -X PUT $host/api/auth -d '{"email":"d@jwt.com", "password":"diner"}' -H 'Content-Type: application/json')
  token=$(echo $response | jq -r '.token')
  curl -s -X POST $host/api/order -H 'Content-Type: application/json' -d '{"franchiseId": 1, "storeId":1, "items":[{ "menuId": 1, "description": "Veggie", "price": 0.05 }]}'  -H "Authorization: Bearer $token"
  sleep 20
  curl -X DELETE $host/api/auth -H "Authorization: Bearer $token"
  sleep 30
done &

# Simulate a diner ordering 20 pizzas every 20 seconds
while true; do
  response=$(curl -s -X PUT $host/api/auth -d '{"email":"d@jwt.com", "password":"diner"}' -H 'Content-Type: application/json')
  token=$(echo $response | jq -r '.token')
  
  # Build a JSON array with 20 pizza items
  items="["
  for i in $(seq 1 20); do
    items+='{"menuId": 1, "description": "Veggie", "price": 0.05}'
    if [ $i -lt 20 ]; then
      items+=","
    fi
  done
  items+="]"
  
  # Place an order for 20 pizzas
  curl -s -X POST $host/api/order -H 'Content-Type: application/json' -d "{\"franchiseId\": 1, \"storeId\":1, \"items\": $items}" -H "Authorization: Bearer $token"
  sleep 20
  curl -X DELETE $host/api/auth -H "Authorization: Bearer $token"
  sleep 30
done &

# Keep script running
wait
