"use client"

import * as React from "react"
import { CheckIcon, ChevronDownIcon, PlusIcon } from "lucide-react"
import { cn } from "~/lib/utils"
import { Input } from "./input"
import { Button } from "./button"

interface ComboboxSelectProps {
  value: string
  onChange: (value: string) => void
  options: { id: number; name: string }[]
  placeholder: string
  className?: string
}

export function ComboboxSelect({
  value,
  onChange,
  options,
  placeholder,
  className
}: ComboboxSelectProps) {
  const [isOpen, setIsOpen] = React.useState(false)
  const [inputValue, setInputValue] = React.useState(value)
  const [filteredOptions, setFilteredOptions] = React.useState(options)

  // Update input value when external value changes
  React.useEffect(() => {
    setInputValue(value)
  }, [value])

  // Filter options based on input
  React.useEffect(() => {
    if (inputValue) {
      const filtered = options.filter(option =>
        option.name.toLowerCase().includes(inputValue.toLowerCase())
      )
      setFilteredOptions(filtered)
    } else {
      setFilteredOptions(options)
    }
  }, [inputValue, options])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setInputValue(newValue)
    setIsOpen(true)
  }

  const handleOptionSelect = (optionName: string) => {
    setInputValue(optionName)
    onChange(optionName)
    setIsOpen(false)
  }

  const handleCustomValueConfirm = () => {
    if (inputValue.trim()) {
      onChange(inputValue.trim())
      setIsOpen(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (filteredOptions.length === 0 && inputValue.trim()) {
        handleCustomValueConfirm()
      } else if (filteredOptions.length === 1 && filteredOptions[0]) {
        handleOptionSelect(filteredOptions[0].name)
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false)
    }
  }

  const handleBlur = () => {
    // Delay closing to allow clicking on options
    setTimeout(() => setIsOpen(false), 150)
  }

  const showCustomOption = Boolean(inputValue.trim() && 
    !options.some(option => option.name.toLowerCase() === inputValue.toLowerCase()) &&
    filteredOptions.length === 0)

  return (
    <div className={cn("relative", className)}>
      <div className="relative">
        <Input
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsOpen(true)}
          onBlur={handleBlur}
          placeholder={placeholder}
          className="pr-8"
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="absolute right-0 top-0 h-full px-2 py-0 hover:bg-transparent"
          onClick={() => setIsOpen(!isOpen)}
        >
          <ChevronDownIcon className="h-4 w-4" />
        </Button>
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-60 overflow-auto">
          {filteredOptions.length > 0 && (
            <div className="p-1">
              {filteredOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={cn(
                    "w-full text-left px-2 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground flex items-center justify-between",
                    value === option.name && "bg-accent text-accent-foreground"
                  )}
                  onClick={() => handleOptionSelect(option.name)}
                >
                  <span>{option.name}</span>
                  {value === option.name && (
                    <CheckIcon className="h-4 w-4" />
                  )}
                </button>
              ))}
            </div>
          )}
          
          {showCustomOption && (
            <div className="border-t border-border p-1">
              <button
                type="button"
                className="w-full text-left px-2 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
                onClick={handleCustomValueConfirm}
              >
                <PlusIcon className="h-4 w-4" />
                <span>Add &quot;{inputValue}&quot;</span>
              </button>
            </div>
          )}
          
          {filteredOptions.length === 0 && !showCustomOption && inputValue && (
            <div className="p-2 text-sm text-muted-foreground text-center">
              No options found
            </div>
          )}
        </div>
      )}
    </div>
  )
}
